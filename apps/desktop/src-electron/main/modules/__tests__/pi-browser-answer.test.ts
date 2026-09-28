import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ questions: null as any, finish: null as any }));
vi.mock("electron", () => ({ ipcMain: {} }));
vi.mock("../server", () => ({ RPC_SERVER_PORT: 9999 }));
vi.mock("../../windows", () => ({ getMainWindows: () => [] }));
vi.mock("../user-setting", () => ({
  default: {
    getSettingSnapshot: async () => ({
      llmUsageSettings: { chat: { providerId: "p", modelId: "m" } },
      llmProviders: [{ id: "p", models: [{ id: "m" }] }],
    }),
  },
}));
vi.mock("../pi-session-host", () => ({
  default: {
    create: async () => ({ ok: true }),
    transcriptOf: () => [],
    prompt: () => new Promise(resolve => (state.finish = resolve)),
    dispose: vi.fn(),
    interactionsOf: () => ({ questions: state.questions }),
  },
}));
import Bridge from "../browser-bridge";
import { PiUserQuestions } from "../pi-user-questions";
it("实际桥接 driver 保留作答成功的返回值", async () => {
  state.questions = new PiUserQuestions({ sessionId: "test", onChange: () => {} });
  const pending = state.questions.ask("call", {
    questions: [{ id: "q", question: "选一个", type: "single", options: ["A", "B"] }],
  });
  const handle = await (Bridge as any).driver().start(
    {
      runId: "r",
      session: { id: "s", pageUrl: "https://example.com" },
      messages: [{ role: "user", content: "开始" }],
    },
    { onEvent: () => {}, onInteractions: () => {} }
  );
  const id = state.questions.pendingRequests()[0].requestId;
  expect(
    handle.answer(id, [{ questionId: "q", selectedValues: ["A"], otherText: "" }])
  ).toBeUndefined();
  expect(await pending).toHaveProperty("content");
  state.finish({ ok: false });
  await handle.done;
});
