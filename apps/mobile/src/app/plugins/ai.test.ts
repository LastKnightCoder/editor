// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import {
  definePlugin,
  type PluginAIEvent,
  type PluginAIRequest,
  type PluginContext,
} from "@tau/plugins";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { PluginPermissionBroker } from "@tau/plugins/permission-host";
import type { AiGenerationRequest, AiGenerationResult } from "@tau/ai/runtime";
import { Role, type ResponseMessage } from "@tau/shared/chat-core";
import type { MobileAiService } from "../../services/ai";
import { createMobilePluginAI } from "./ai";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});
const input = (): PluginAIRequest => ({
  feature: "summary",
  messages: [{ role: "user", content: "正文" }],
});
const response = (content: string): ResponseMessage => ({
  role: Role.Assistant,
  content,
  usage: { inputTokens: 7, outputTokens: 3, cacheReadTokens: 2, cacheWriteTokens: 0 },
});

async function setup() {
  const result = deferred<AiGenerationResult>();
  let snapshot: ((value: ResponseMessage) => void) | undefined;
  const abort = vi.fn(() => result.resolve({ outcome: "aborted", response: null }));
  const start = vi.fn(
    async (_request: AiGenerationRequest, observer?: (value: ResponseMessage) => void) => {
      snapshot = observer;
      return { requestId: "run", result: result.promise, abort };
    }
  );
  const resolveModel = vi.fn(async () => ({
    model: { contextWindow: 8192, maxTokens: 1024, input: ["text", "image"] },
  }));
  const call = vi.fn(async (command: string) => {
    if (command === "plugin_ai_register") return "session";
    if (command === "plugin_ai_prepare")
      return { model: { providerId: "host", modelId: "model" }, revision: "one" };
    if (command === "plugin_ai_begin")
      return {
        model: { providerId: "host", modelId: "model" },
        maxOutputTokens: 512,
        modelRevision: "a".repeat(64),
      };
    if (command === "plugin_ai_finish") return { accepted: true };
    if (command === "plugin_ai_status") return { enabled: false, configured: true };
  });
  const lifetime = new AbortController();
  const host = createMobilePluginAI({
    databaseName: "one.db",
    token: "host-token",
    call: call as <T>(command: string, args: Record<string, unknown>) => Promise<T>,
    ai: () =>
      ({ models: { resolve: resolveModel }, generation: { start } }) as unknown as MobileAiService,
  });
  cleanups.push(() => host.dispose());
  const client = await host.adapter.bind(
    { id: "test.plugin", name: "测试" },
    [{ id: "summary", name: "摘要" }],
    lifetime.signal
  );
  const started = async () => {
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
  };
  return {
    host,
    client,
    lifetime,
    result,
    call,
    start,
    abort,
    resolveModel,
    started,
    snapshot: (text: string) => snapshot?.(response(text)),
  };
}

it("流式只交付文本增量和中立用量，模型由宿主分配，图片和system保持原协议", async () => {
  const f = await setup();
  const events: PluginAIEvent[] = [];
  const pending = (async () => {
    for await (const event of f.client.stream({
      feature: "summary",
      messages: [
        { role: "system", content: "系统一" },
        { role: "system", content: "系统二" },
        { role: "user", content: "", images: [{ data: "AQID", mimeType: "image/png" }] },
      ],
    }))
      events.push(event);
  })();
  await f.started();
  f.snapshot("你");
  f.snapshot("你好");
  f.result.resolve({ outcome: "completed", response: response("你好") });
  await pending;
  expect(events).toEqual([
    { type: "text", delta: "你" },
    { type: "text", delta: "好" },
    {
      type: "done",
      result: { text: "你好", usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 } },
    },
  ]);
  expect(f.start.mock.calls[0][0]).toMatchObject({
    databaseName: "one.db",
    model: { providerId: "host", modelId: "model" },
    system: "系统一\n\n系统二",
    maxOutputTokens: 512,
    messages: [{ role: "user", content: "", images: [{ data: "AQID", mimeType: "image/png" }] }],
  });
  expect(f.call).toHaveBeenCalledWith(
    "plugin_ai_begin",
    expect.objectContaining({
      token: "host-token",
      database: "one.db",
      capacity: { contextWindow: 8192, maxTokens: 1024 },
      reference: { model: { providerId: "host", modelId: "model" }, revision: "one" },
    })
  );
});

it("请求输入在等待授权前冻结，外部修改不改变模型请求", async () => {
  const f = await setup();
  const request = input();
  const pending = f.client.chat(request);
  request.messages[0].content = "被修改的正文";
  await f.started();
  expect(f.start.mock.calls[0][0].messages[0].content).toBe("正文");
  f.result.resolve({ outcome: "completed", response: response("好") });
  await pending;
});

it("原生额度拒绝时不启动模型", async () => {
  const f = await setup();
  f.call.mockImplementationOnce(async () => {
    throw "AI_QUOTA_EXCEEDED：今日额度不足";
  });
  await expect(f.client.chat(input())).rejects.toThrow("AI_QUOTA_EXCEEDED");
  expect(f.start).not.toHaveBeenCalled();
});

it("插件停用取消在途请求，迟到结果不交付且请求结算为aborted", async () => {
  const f = await setup();
  const pending = f.client.chat(input());
  const rejected = expect(pending).rejects.toThrow();
  await f.started();
  f.lifetime.abort();
  await rejected;
  expect(f.abort).toHaveBeenCalled();
  expect(f.call).toHaveBeenCalledWith(
    "plugin_ai_unregister",
    expect.objectContaining({ session: "session" })
  );
  expect(f.call).toHaveBeenCalledWith(
    "plugin_ai_finish",
    expect.objectContaining({ status: "aborted" })
  );
});

it("提前退出流会取消生成并等待原生结算", async () => {
  const f = await setup();
  const pending = (async () => {
    for await (const event of f.client.stream(input())) {
      expect(event.type).toBe("text");
      break;
    }
  })();
  await f.started();
  f.snapshot("第一段");
  await pending;
  expect(f.abort).toHaveBeenCalled();
  expect(f.call).toHaveBeenCalledWith(
    "plugin_ai_finish",
    expect.objectContaining({ status: "aborted" })
  );
});

it("最终原生复验失败不向插件交付成功", async () => {
  const f = await setup();
  const original = f.call.getMockImplementation()!;
  f.call.mockImplementation(async command =>
    command === "plugin_ai_finish"
      ? { accepted: false, error: "AI_CONFIG_CHANGED：模型已改变" }
      : original(command)
  );
  const pending = f.client.chat(input());
  const rejected = expect(pending).rejects.toThrow("AI_CONFIG_CHANGED");
  await f.started();
  f.result.resolve({ outcome: "completed", response: response("迟到成功") });
  await rejected;
});

it("供应商没有可确认的Token用量时返回null并保留原生预占", async () => {
  const f = await setup();
  const pending = f.client.chat(input());
  await f.started();
  f.result.resolve({ outcome: "completed", response: { role: Role.Assistant, content: "回答" } });
  expect(await pending).toEqual({ text: "回答", usage: null });
  expect(f.call).toHaveBeenCalledWith("plugin_ai_finish", expect.objectContaining({ usage: null }));
});

it("原始网络错误不会泄露给插件", async () => {
  const f = await setup();
  const pending = f.client.chat(input());
  const rejected = expect(pending).rejects.toThrow(
    "AI_REQUEST_FAILED：模型请求失败，请检查服务商配置"
  );
  await f.started();
  f.result.resolve({
    outcome: "failed",
    response: null,
    error: {
      code: "AI_TRANSPORT_FAILED",
      message: "Authorization: private-token",
      retryable: false,
    },
  });
  await rejected;
});

it.each([
  {
    feature: "summary",
    messages: [
      { role: "assistant", content: "x", images: [{ data: "AQID", mimeType: "image/png" }] },
    ],
  },
  {
    feature: "summary",
    messages: [
      {
        role: "user",
        content: "x",
        images: [{ data: "data:image/png;base64,AQID", mimeType: "image/png" }],
      },
    ],
  },
])("非法图片在授权和请求前拒绝", async value => {
  const f = await setup();
  await expect(f.client.chat(value as PluginAIRequest)).rejects.toThrow("AI_INVALID_REQUEST");
  expect(f.call).not.toHaveBeenCalledWith("plugin_ai_begin", expect.anything());
  expect(f.start).not.toHaveBeenCalled();
});

it("绑定完成前停用会注销迟到的原生session", async () => {
  const session = deferred<string>();
  const lifetime = new AbortController();
  const call = vi.fn(async command =>
    command === "plugin_ai_register" ? session.promise : undefined
  );
  const host = createMobilePluginAI({
    databaseName: "one.db",
    token: "host-token",
    ai: vi.fn(),
    call: call as never,
  });
  cleanups.push(() => host.dispose());
  const pending = host.adapter.bind({ id: "test.plugin", name: "测试" }, [], lifetime.signal);
  const rejected = expect(pending).rejects.toThrow();
  lifetime.abort();
  session.resolve("late-session");
  await rejected;
  expect(call).toHaveBeenCalledWith(
    "plugin_ai_unregister",
    expect.objectContaining({ session: "late-session" })
  );
});

it("没有配置界面时明确报错，宿主管理仍可查询状态", async () => {
  const f = await setup();
  expect(() => f.client.openSettings()).toThrow("AI_SETTINGS_UNAVAILABLE");
  expect(await f.client.getStatus("summary")).toEqual({ configured: true, enabled: false });
});

it.each([
  [{ role: "system", content: "只有系统指令" }],
  [
    { role: "user", content: "问题" },
    { role: "assistant", content: "回答" },
  ],
] as const)("本地可判定的末尾消息错误在额度预占前拒绝", async (...messages) => {
  const f = await setup();
  await expect(
    f.client.chat({
      feature: "summary",
      messages: messages as unknown as PluginAIRequest["messages"],
    })
  ).rejects.toThrow("AI_INVALID_REQUEST");
  expect(f.call).not.toHaveBeenCalledWith("plugin_ai_begin", expect.anything());
  expect(f.start).not.toHaveBeenCalled();
});

it("文本模型的图片输入在额度预占前拒绝", async () => {
  const f = await setup();
  f.resolveModel.mockResolvedValueOnce({
    model: { contextWindow: 8192, maxTokens: 1024, input: ["text"] },
  });
  await expect(
    f.client.chat({
      feature: "summary",
      messages: [{ role: "user", content: "", images: [{ data: "AQID", mimeType: "image/png" }] }],
    })
  ).rejects.toThrow("不支持图片");
  expect(f.call).not.toHaveBeenCalledWith("plugin_ai_begin", expect.anything());
  expect(f.start).not.toHaveBeenCalled();
});

it("原生模型配置冲突没有发网，零用量结算并拒绝成功", async () => {
  const f = await setup();
  const pending = f.client.chat(input());
  const rejected = expect(pending).rejects.toThrow("AI_CONFIG_CHANGED");
  await f.started();
  expect(f.start.mock.calls[0][0].expectedModelRevision).toBe("a".repeat(64));
  f.result.resolve({
    outcome: "failed",
    response: null,
    error: { code: "AI_CONFIG_CHANGED", message: "配置已变化", retryable: false },
  });
  await rejected;
  expect(f.call).toHaveBeenCalledWith(
    "plugin_ai_finish",
    expect.objectContaining({
      status: "error",
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    })
  );
});

it("共享服务在接受生成前暂停时不消耗Token预占", async () => {
  const f = await setup();
  f.start.mockRejectedValueOnce(new Error("AI_LIBRARY_BUSY:应用已暂停"));
  await expect(f.client.chat(input())).rejects.toThrow("AI_LIBRARY_BUSY");
  expect(f.call).toHaveBeenCalledWith(
    "plugin_ai_finish",
    expect.objectContaining({
      status: "error",
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    })
  );
});

it("正式PluginHost的ai能力声明、授权与撤权取消接入同一适配器", async () => {
  const f = await setup();
  const permissions = new PluginPermissionBroker(
    {
      read: async () => ({ "test.capability": { "ai:flashcardGeneration": "granted" } }),
      write: async () => undefined,
    },
    () => true
  );
  let context!: PluginContext;
  const pluginHost = new PluginHost({
    workspaceId: "one.db",
    storage: createMemoryStorage(),
    ai: f.host.adapter,
    permissions,
  });
  pluginHost.registerTrusted({
    ...definePlugin({
      id: "test.capability",
      name: "闪卡",
      version: "1.0.0",
      create: () => ({
        activate(value) {
          context = value;
        },
      }),
    }),
    permissions: ["ai:flashcardGeneration"],
  });
  try {
    await pluginHost.enable("test.capability");
    await expect(context.ai.requestCapability("chat")).rejects.toThrow("未声明");
    const capability = await context.ai.requestCapability("flashcardGeneration");
    const pending = capability.chat({ messages: [{ role: "user", content: "总结" }] });
    const rejected = expect(pending).rejects.toThrow();
    await f.started();
    expect(f.call).toHaveBeenCalledWith(
      "plugin_ai_register",
      expect.objectContaining({ hostFeature: "flashcardGeneration" })
    );
    await permissions.reset("test.capability", "ai:flashcardGeneration");
    await rejected;
    expect(f.abort).toHaveBeenCalled();
  } finally {
    await pluginHost.dispose();
    permissions.dispose();
  }
});
