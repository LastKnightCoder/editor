/**
 * 扩展一次性运行的 v2 协议（M5，渲染端 aiServer）：ai.run.start 立即返回、过程经 ai.run.event 推送、
 * 最后一条一定是 settled；停止转交 pi；侧栏持久对话不该打到这里；模型报错按失败收尾。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { AiRunEventNotification } from "@tau/shared";
import type { RpcRequestMessage } from "@/types/rpc";

const mocks = vi.hoisted(() => ({
  onEvent: null as ((event: AgentSessionEvent) => void) | null,
  resolveRun: null as ((result: unknown) => void) | null,
  abort: vi.fn(),
  singleEvent: null as ((event: unknown) => void) | null,
  singleResolve: null as ((result: unknown) => void) | null,
  singleCancel: vi.fn(),
  handlers: new Map<string, (request: RpcRequestMessage) => Promise<unknown>>(),
  notifications: [] as Array<{ method: string; data: unknown }>,
}));

vi.mock("@/constants", () => ({
  Role: { Assistant: "assistant", User: "user", System: "system", Tool: "tool" },
}));
vi.mock("@/services/piAgentRunner", () => ({
  runPiAgent: (_options: unknown, onEvent: (event: AgentSessionEvent) => void) => {
    mocks.onEvent = onEvent;
    return {
      result: new Promise(resolve => {
        mocks.resolveRun = resolve;
      }),
      abort: mocks.abort,
    };
  },
}));
vi.mock("@/services/piLLM", () => ({
  piStreamChat: (_options: unknown, onEvent: (event: unknown) => void) => {
    mocks.singleEvent = onEvent;
    return {
      result: new Promise(resolve => {
        mocks.singleResolve = resolve;
      }),
      cancel: mocks.singleCancel,
    };
  },
  piTextOf: (partial: { text?: string }) => partial?.text ?? "",
  piThinkingOf: () => "",
}));
vi.mock("@/services/browserBridgeRenderer", () => ({ installBrowserBridgeRenderer: vi.fn() }));
vi.mock("@/stores/useSettingStore", () => {
  let state = {
    setting: {
      llmProviders: [{ id: "p1", models: [{ id: "m1" }, { id: "qwen2.5:7b" }] }],
      llmUsageSettings: { chat: { providerId: "p1", modelId: "m1" } } as Record<string, unknown>,
    },
  };
  return {
    default: {
      getState: () => state,
      setState: (recipe: (draft: typeof state) => typeof state | void) => {
        const draft = structuredClone(state);
        state = recipe(draft) ?? draft;
      },
    },
  };
});
vi.mock("@/stores/useSkillStore", () => ({ default: { getState: () => ({ skills: [] }) } }));
vi.mock("@/tools", () => ({ ensureToolingReady: vi.fn() }));
vi.mock("@/utils/WebSocketServer", () => ({
  default: class {
    addRequestHandler(name: string, handler: (request: RpcRequestMessage) => Promise<unknown>) {
      mocks.handlers.set(name, handler);
    }
    sendNotification(method: string, data: unknown) {
      mocks.notifications.push({ method, data });
    }
    close() {}
  },
}));
vi.mock("@/utils/WebSocketClient", () => ({ default: class {} }));
vi.mock("../open-content", () => ({ openContent: vi.fn() }));
vi.mock("../page-navigation", () => ({ openPage: vi.fn() }));
vi.mock("@/commands/piSession", () => ({}));
vi.mock("@/utils", () => ({
  createSmartExtractProvider: vi.fn(),
  createFullPageProvider: vi.fn(),
  collectClipStream: vi.fn(),
  remoteResourceToLocal: vi.fn(),
  getContentLength: vi.fn(),
  defaultContentEventBus: { subscribe: vi.fn() },
}));
vi.mock("@/commands/file", () => ({}));
vi.mock("@/hooks/useUploadResource", () => ({ uploadResource: vi.fn() }));
vi.mock("@/commands/content", () => ({}));
vi.mock("@/commands/card", () => ({}));
vi.mock("@/commands/article", () => ({}));
vi.mock("@/utils/event-bus/card-event-bus", () => ({ defaultCardEventBus: {} }));
vi.mock("@/utils/event-bus/article-event-bus", () => ({ defaultArticleEventBus: {} }));
vi.mock("@/stores/useExtNoteInsertStore", () => ({ default: { getState: () => ({}) } }));
vi.mock("@/commands/window", () => ({ showAndFocusWindow: vi.fn() }));
vi.mock("@/utils/embedding-model-info", () => ({ resolveEmbeddingModelInfoFromSetting: vi.fn() }));

import { __aiServerTestUtils, closeAiServer, initAiServer } from "../aiServer";
import { openContent } from "../open-content";
import { useThemeStore } from "@tau/themes/react";

const { handleRunStart, handleRunAbort } = __aiServerTestUtils;

describe("设置 RPC", () => {
  beforeEach(() => {
    mocks.handlers.clear();
    initAiServer();
  });
  afterEach(() => closeAiServer());

  it("扩展选模型：按 modelId 写入聊天用量，随后读回所选模型", async () => {
    const params = { feature: "chat", providerId: "p1", modelId: "qwen2.5:7b" };
    await mocks.handlers.get("settings.setLlmUsage")!(request("settings.setLlmUsage", params));
    const result = (await mocks.handlers.get("settings.getChatModelConfig")!(
      request("settings.getChatModelConfig", {})
    )) as { model: { id: string } | null };
    expect(result.model?.id).toBe("qwen2.5:7b");
  });
});

describe("主题同步 RPC", () => {
  beforeEach(() => {
    mocks.handlers.clear();
    mocks.notifications.length = 0;
    useThemeStore.getState().setTheme("paper");
    initAiServer();
  });
  afterEach(() => closeAiServer());

  it("读取当前主题族，换主题时只推送主题 key", async () => {
    await expect(
      mocks.handlers.get("appearance.getTheme")!(request("appearance.getTheme", {}))
    ).resolves.toEqual({ theme: "paper" });

    useThemeStore.getState().setAppearance("dark");
    expect(mocks.notifications.filter(n => n.method === "appearance.themeChanged")).toEqual([]);

    useThemeStore.getState().setTheme("sakura");
    expect(mocks.notifications.filter(n => n.method === "appearance.themeChanged")).toEqual([
      { method: "appearance.themeChanged", data: { theme: "sakura" } },
    ]);
  });

  it("关闭服务后不再推送", () => {
    closeAiServer();
    useThemeStore.getState().setTheme("mint");
    expect(mocks.notifications).toEqual([]);
  });
});

describe("内容打开 RPC", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.handlers.clear();
    vi.mocked(openContent).mockReset();
    initAiServer();
  });
  afterEach(() => {
    closeAiServer();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("仅注册当前入口，打开完成后才返回成功", async () => {
    expect(mocks.handlers.has("tab.open")).toBe(false);
    expect(mocks.handlers.has("block.preview.open")).toBe(true);
    let finish!: () => void;
    vi.mocked(openContent).mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    const handler = mocks.handlers.get("content.open")!;
    const pending = handler(request("content.open", { type: "card", id: 7 }));
    await Promise.resolve();
    expect(openContent).toHaveBeenCalledWith("card", 7);
    finish();
    await expect(pending).resolves.toEqual({ success: true });
  });

  it("无有效内容目标时返回明确错误", async () => {
    vi.mocked(openContent).mockRejectedValue(new Error("无法打开该内容"));
    await expect(
      mocks.handlers.get("content.open")!(request("content.open", { type: "unknown", id: 7 }))
    ).resolves.toEqual({ success: false, error: "无法打开该内容" });
  });
});

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

const request = (method: string, params: unknown): RpcRequestMessage =>
  ({ id: "req", method, params, type: "request" }) as unknown as RpcRequestMessage;

let published: AiRunEventNotification[] = [];
const server = {
  sendNotification: (_method: string, data: AiRunEventNotification) => published.push(data),
} as never;

beforeEach(() => {
  published = [];
  vi.clearAllMocks();
});

describe("aiServer 一次性运行（v2）", () => {
  it("立即返回 runId；带工具运行的事件带递增 seq，最后一条是 settled", async () => {
    const result = await handleRunStart(
      request("ai.run.start", { runId: "r1", messages: [{ role: "user", content: "总结" }] }),
      server
    );
    expect(result).toEqual({ runId: "r1" });
    await flush();
    mocks.onEvent!({ type: "agent_start" } as AgentSessionEvent);
    mocks.onEvent!({
      type: "message_start",
      message: { role: "assistant", content: [] },
    } as unknown as AgentSessionEvent);
    mocks.onEvent!({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "总结如下" }],
        stopReason: "stop",
      },
    } as unknown as AgentSessionEvent);
    mocks.resolveRun!({ ok: true, lastAssistantText: "总结如下", aborted: false });
    await flush();

    expect(published.map(item => item.seq)).toEqual(published.map((_, index) => index));
    expect(published.at(-1)!.event).toEqual({
      type: "settled",
      ok: true,
      aborted: false,
      lastText: "总结如下",
    });
  });

  it("停止：转交 pi 的 abort，settled 标记 aborted", async () => {
    await handleRunStart(
      request("ai.run.start", { runId: "r2", messages: [{ role: "user", content: "总结" }] }),
      server
    );
    await flush();
    await handleRunAbort(request("ai.run.abort", { runId: "r2" }));
    expect(mocks.abort).toHaveBeenCalled();
    mocks.resolveRun!({ ok: true, lastAssistantText: "", aborted: true });
    await flush();
    expect(published.at(-1)!.event).toMatchObject({ type: "settled", aborted: true, ok: false });
  });

  it("纯文本单发（行内问答）：正文快照 + settled；失败带错误", async () => {
    await handleRunStart(
      request("ai.run.start", {
        runId: "r3",
        messages: [{ role: "user", content: "这段什么意思" }],
        enableTools: false,
      }),
      server
    );
    await flush();
    mocks.singleEvent!({ type: "text_delta", partial: { text: "意思是" } });
    mocks.singleResolve!({ ok: false, aborted: false, error: "额度不足", text: "意思是" });
    await flush();
    expect(published.map(item => item.event.type)).toEqual(["text", "settled"]);
    expect(published.at(-1)!.event).toMatchObject({
      type: "settled",
      ok: false,
      error: "额度不足",
    });
  });

  it("侧栏持久对话打到渲染端：拒绝（应连主进程 /aiServerMain）", async () => {
    await expect(
      handleRunStart(
        request("ai.run.start", {
          runId: "r4",
          messages: [{ role: "user", content: "x" }],
          session: { id: "s", pageUrl: "https://a.com" },
        }),
        server
      )
    ).rejects.toThrow("aiServerMain");
  });
});
