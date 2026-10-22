import { describe, expect, it, vi } from "vitest";
import { definePlugin, type PluginActionDefinition, type PluginContext } from "../index";
import { PluginHost, createMemoryStorage } from "../host";

async function setup() {
  const registered: Readonly<PluginActionDefinition>[] = [];
  const dispose = vi.fn();
  const host = new PluginHost({
    workspaceId: "A",
    storage: createMemoryStorage(),
    actions: {
      register: (_context, definition) => {
        registered.push(definition);
        return { dispose };
      },
    },
  });
  let context!: PluginContext;
  host.registerTrusted(
    definePlugin({
      id: "sample",
      name: "示例",
      version: "1",
      create: () => ({
        activate(ctx) {
          context = ctx;
        },
      }),
    })
  );
  await host.enable("sample");
  return { host, context, registered, dispose };
}

describe("对象动作", () => {
  it("校验定义；目标去重，run 收到冻结的引用", async () => {
    const { host, context, registered } = await setup();
    const run = vi.fn();
    const base = { id: "to-question", title: "转为问题", targets: ["card"] as const, run };
    expect(() => context.actions.register({ ...base, id: "a b" })).toThrow("插件标识");
    expect(() => context.actions.register({ ...base, title: "" })).toThrow("标题");
    expect(() => context.actions.register({ ...base, targets: [] })).toThrow("至少");
    expect(() => context.actions.register({ ...base, targets: ["diary" as never] })).toThrow(
      "不支持"
    );
    expect(() => context.actions.register({ ...base, run: undefined as never })).toThrow("run");
    context.actions.register({ ...base, targets: ["card", "article", "card"] });
    expect(registered[0].targets).toEqual(["card", "article"]);
    expect(host.listContributions("sample")).toMatchObject({ action: 1 });
    registered[0].run({ kind: "card", id: "7", extra: 1 } as never);
    expect(run).toHaveBeenCalledWith({ kind: "card", id: "7" });
    expect(Object.isFrozen(run.mock.calls[0][0])).toBe(true);
    context.actions.register({ id: "msg", title: "记下", targets: ["chat-message"], run });
    registered[1].run({
      kind: "chat-message",
      session: { kind: "chat-session", id: "s1", title: "x" } as never,
      messageIds: ["e1", "e2"],
      role: "assistant",
      text: "回答",
    });
    expect(run).toHaveBeenLastCalledWith({
      kind: "chat-message",
      session: { kind: "chat-session", id: "s1" },
      messageIds: ["e1", "e2"],
      role: "assistant",
      text: "回答",
    });
    await host.dispose();
  });

  it("注销或停用后 run 不再调用插件", async () => {
    const { host, context, registered, dispose } = await setup();
    const run = vi.fn();
    const handle = context.actions.register({ id: "a", title: "A", targets: ["document"], run });
    context.actions.register({ id: "b", title: "B", targets: ["document"], run });
    await handle.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(() => registered[0].run({ kind: "document", id: "1" })).toThrow("已注销");
    await host.disable("sample");
    expect(() => registered[1].run({ kind: "document", id: "1" })).toThrow("失效");
    expect(run).not.toHaveBeenCalled();
    await host.dispose();
  });
});
