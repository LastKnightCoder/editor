import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  questions: null as any,
  finish: null as any,
  created: null as any,
  toolCall: null as null | ((payload: unknown) => void),
  handled: [] as unknown[],
}));
vi.mock("electron", () => ({ ipcMain: {} }));
vi.mock("../../windows", () => ({ getMainWindows: () => [] }));
vi.mock("../user-setting", () => ({
  default: {
    getSettingSnapshot: async () => ({
      llmUsageSettings: { chat: { providerId: "p", modelId: "m" } },
      llmProviders: [{ id: "p", models: [{ id: "m" }, { id: "big" }] }],
    }),
  },
}));
vi.mock("../pi-session-host", () => ({
  default: {
    create: async (client: any, request: any) => {
      state.created = request;
      state.toolCall = payload => client.send("pi-tool-call", payload);
      return { ok: true };
    },
    transcriptOf: () => [],
    prompt: () => new Promise(resolve => (state.finish = resolve)),
    dispose: vi.fn(),
    abort: vi.fn(),
    interactionsOf: () => ({ questions: state.questions }),
    bridgeOf: () => ({
      handleResult: (id: string, result: unknown) => state.handled.push({ id, result }),
      handleError: (id: string, error: string) => state.handled.push({ id, error }),
    }),
  },
}));

import { createCompanionRunDriver, resolveRunModel } from "../browser-companion/run-driver";
import { PiUserQuestions } from "../pi-user-questions";

const fakePeer = (reply: unknown) => ({ request: vi.fn(async () => reply) }) as any;

const start = (driver: ReturnType<typeof createCompanionRunDriver>, extra = {}) =>
  driver.start(
    {
      runId: "r",
      session: { id: "s", pageUrl: "https://example.com" },
      messages: [{ role: "user", content: "开始" }],
      ...extra,
    } as never,
    { onEvent: () => {}, onInteractions: () => {} }
  );

describe("伴读对话 driver", () => {
  it("保留作答成功的返回值", async () => {
    state.questions = new PiUserQuestions({ sessionId: "test", onChange: () => {} });
    const pending = state.questions.ask("call", {
      questions: [{ id: "q", question: "选一个", type: "single", options: ["A", "B"] }],
    });
    const handle = await start(
      createCompanionRunDriver(() => ({ peer: fakePeer(null), allowTools: false }))
    );
    const id = state.questions.pendingRequests()[0].requestId;
    expect(
      handle.answer(id, [{ questionId: "q", selectedValues: ["A"], otherText: "" }])
    ).toBeUndefined();
    expect(await pending).toHaveProperty("content");
    state.finish({ ok: false });
    await handle.done;
  });

  it("没有 tools 权限时不给应用工具、也不启用 pi 自带的文件与命令工具；页面工具经连接反向执行", async () => {
    const peer = fakePeer({ content: "正文" });
    const handle = await start(
      createCompanionRunDriver(() => ({ peer, allowTools: false })),
      {
        browserTools: [
          { type: "function", function: { name: "read_page", description: "", parameters: {} } },
        ],
      }
    );
    expect(state.created.customTools.map((tool: { name: string }) => tool.name)).toEqual([
      "read_page",
    ]);
    expect(state.created.hostToolsOnly).toBe(true);
    state.handled = [];
    state.toolCall!({ sessionId: "x", toolCallId: "t1", toolName: "read_page", args: { a: 1 } });
    await vi.waitFor(() => expect(state.handled).toHaveLength(1));
    expect(peer.request).toHaveBeenCalledWith(
      "page.tool",
      { pageUrl: "https://example.com", name: "read_page", args: { a: 1 } },
      expect.any(Number)
    );
    expect(state.handled[0]).toEqual({ id: "t1", result: { content: "正文" } });
    state.toolCall!({ sessionId: "x", toolCallId: "t2", toolName: "search_knowledge", args: {} });
    await vi.waitFor(() => expect(state.handled).toHaveLength(2));
    expect(state.handled[1]).toMatchObject({ id: "t2", error: expect.any(String) });
    state.finish({ ok: false });
    await handle.done;
  });

  it("连接已断开时拒绝起跑", async () => {
    await expect(start(createCompanionRunDriver(() => null))).rejects.toThrow("断开");
  });
});

describe("resolveRunModel", () => {
  const setting = {
    llmUsageSettings: { chat: { providerId: "p", modelId: "m" } },
    llmProviders: [{ id: "p", models: [{ id: "m" }, { id: "big" }] }],
  };
  it("扩展指定已配置的模型时用它", () => {
    expect(resolveRunModel(setting, { providerId: "p", modelId: "big" }, "chat")).toEqual({
      providerId: "p",
      modelId: "big",
    });
  });
  it("未配置的模型回落到默认", () => {
    expect(resolveRunModel(setting, { providerId: "x", modelId: "y" }, "chat")).toEqual({
      providerId: "p",
      modelId: "m",
    });
  });
});
