import { expect, it, vi } from "vitest";
import {
  definePlugin,
  PluginPermissionError,
  type PluginContext,
  type PluginPermission,
  type PluginAICapabilityClient,
} from "../index";
import { PluginHost, createMemoryStorage } from "../host";
import { unavailableAI } from "../ai";

async function setup(
  declared: readonly PluginPermission[] = ["ai:flashcardGeneration"],
  client: PluginAICapabilityClient = {
    chat: async () => ({ text: "答案", usage: null }),
    async *stream() {
      yield { type: "done", result: { text: "答案", usage: null } };
    },
  }
) {
  let context!: PluginContext;
  let granted = false;
  const listeners = new Set<() => void>();
  const bind = vi.fn(async () => unavailableAI);
  const bindCapability = vi.fn(async () => client);
  const ensure = vi.fn(async () => {
    granted = true;
  });
  const host = new PluginHost({
    environment: { platform: "desktop", input: { coarsePointer: false, finePointer: true } },
    workspaceId: "test",
    storage: createMemoryStorage(),
    ai: { bind, bindCapability },
    permissions: {
      ensure,
      query: async () => (granted ? "granted" : "denied"),
      request: async () => granted,
      subscribe: listener => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
  });
  host.registerTrusted({
    ...definePlugin({
      id: "test.capability",
      name: "能力测试",
      version: "1.0.0",
      create: () => ({
        activate(ctx) {
          context = ctx;
        },
      }),
    }),
    permissions: declared,
  });
  await host.enable("test.capability");
  return {
    host,
    context,
    bind,
    bindCapability,
    ensure,
    listeners,
    revoke() {
      granted = false;
      for (const listener of listeners) listener();
    },
  };
}

it("未声明自定义 AI 也可申请宿主能力，绑定真实身份并复用同一激活期客户端", async () => {
  const fixture = await setup();
  const first = await fixture.context.ai.requestCapability("flashcardGeneration");
  await expect(fixture.context.ai.requestCapability("chat")).rejects.toMatchObject({
    permission: "ai:chat",
    reason: "undeclared",
  });
  const second = await fixture.context.ai.requestCapability("flashcardGeneration");
  expect(await first.chat({ messages: [{ role: "user", content: "资料" }] })).toEqual({
    text: "答案",
    usage: null,
  });
  expect(await second.chat({ messages: [{ role: "user", content: "资料二" }] })).toEqual({
    text: "答案",
    usage: null,
  });
  expect(fixture.bind).not.toHaveBeenCalled();
  expect(fixture.bindCapability).toHaveBeenCalledOnce();
  expect(fixture.bindCapability).toHaveBeenCalledWith(
    { id: "test.capability", name: "能力测试" },
    "flashcardGeneration",
    fixture.context.signal
  );
  expect(fixture.ensure).toHaveBeenCalledWith(
    fixture.context,
    { id: "test.capability", name: "能力测试" },
    ["ai:flashcardGeneration"]
  );
  expect(fixture.listeners.size).toBe(0);
  await fixture.host.dispose();
});

it("未知能力、未声明和拒绝授权都不能绑定模型", async () => {
  const fixture = await setup([]);
  await expect(fixture.context.ai.requestCapability("translation" as never)).rejects.toThrow(
    "AI_UNDECLARED_CAPABILITY"
  );
  await expect(fixture.context.ai.requestCapability("flashcardGeneration")).rejects.toMatchObject({
    permission: "ai:flashcardGeneration",
    reason: "undeclared",
  });
  expect(fixture.ensure).not.toHaveBeenCalled();
  expect(fixture.bindCapability).not.toHaveBeenCalled();
  await fixture.host.dispose();
  const denied = await setup();
  denied.ensure.mockRejectedValue(new PluginPermissionError("ai:flashcardGeneration", "denied"));
  await expect(denied.context.ai.requestCapability("flashcardGeneration")).rejects.toMatchObject({
    reason: "denied",
  });
  expect(denied.bindCapability).not.toHaveBeenCalled();
  await denied.host.dispose();
});

it("授权检查前固定请求快照，返回的事件与适配器对象隔离", async () => {
  const event = { type: "done" as const, result: { text: "原答案", usage: null } };
  const client: PluginAICapabilityClient = {
    chat: async () => event.result,
    async *stream(request) {
      expect(request.messages[0].content).toBe("原资料");
      yield event;
    },
  };
  const fixture = await setup(undefined, client);
  const capability = await fixture.context.ai.requestCapability("flashcardGeneration");
  const input = { messages: [{ role: "user" as const, content: "原资料" }] };
  const pending = capability.chat(input);
  input.messages[0].content = "后来修改";
  const result = await pending;
  expect(result).not.toBe(event.result);
  event.result.text = "后来修改";
  expect(result.text).toBe("原答案");
  await fixture.host.dispose();
});

it.each(["revoke", "disable", "caller"] as const)(
  "通用能力的 %s 会中止在途生成并清理订阅",
  async action => {
    let signal: AbortSignal | undefined;
    const started = vi.fn();
    const client: PluginAICapabilityClient = {
      chat: async () => ({ text: "", usage: null }),
      async *stream(request) {
        signal = request.signal;
        started();
        await new Promise<void>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal?.reason), { once: true });
        });
        yield { type: "done", result: { text: "迟到", usage: null } };
      },
    };
    const fixture = await setup(undefined, client);
    const capability = await fixture.context.ai.requestCapability("flashcardGeneration");
    const caller = new AbortController();
    const pending = capability.chat({
      messages: [{ role: "user", content: "资料" }],
      signal: caller.signal,
    });
    const rejected = expect(pending).rejects.toBeDefined();
    await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());
    if (action === "revoke") fixture.revoke();
    if (action === "disable") await fixture.host.disable("test.capability");
    if (action === "caller") caller.abort(new Error("取消"));
    await rejected;
    expect(signal?.aborted).toBe(true);
    expect(fixture.listeners.size).toBe(0);
    if (action !== "caller") {
      await expect(
        capability.chat({ messages: [{ role: "user", content: "再次调用" }] })
      ).rejects.toBeDefined();
      expect(started).toHaveBeenCalledOnce();
    }
    await fixture.host.dispose();
  }
);
