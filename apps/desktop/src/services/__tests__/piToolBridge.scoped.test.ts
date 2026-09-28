import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ listener: null as any, result: vi.fn() }));
vi.mock("@/tools", async () => ({
  default: (await import("../../tools/toolRegistry")).default,
  ensureToolingReady: () => {},
}));
vi.mock("../piInteractions", () => ({ initPiInteractions: () => {} }));
vi.mock("@/commands/piSession", () => ({
  onPiToolCall: (fn: any) => (state.listener = fn),
  piSessionToolResult: state.result,
  piSessionToolError: vi.fn(),
}));
import registry from "../../tools/toolRegistry";
import { initPiToolBridge, registerPiToolSessionContext } from "../piToolBridge";
it("会话持有作用域工具，页面注销后仍能执行且不串到另一份 PDF", async () => {
  const execute = vi.fn(async () => ({ content: "第一份 PDF" }));
  registry.registerScopedTools("pdf-a", "PDF", [
    {
      name: "pdf_search",
      description: "检索",
      parameters: { type: "object", properties: {} },
      executor: execute,
    },
  ]);
  registerPiToolSessionContext("s", { scopedTools: registry.getScopedTools("pdf-a") });
  registry.unregisterSource("pdf-a");
  registry.registerScopedTools("pdf-b", "PDF", [
    {
      name: "pdf_search",
      description: "检索",
      parameters: { type: "object", properties: {} },
      executor: async () => ({ content: "错误的 PDF" }),
    },
  ]);
  initPiToolBridge();
  state.listener({ sessionId: "s", toolCallId: "call", toolName: "pdf_search", args: {} });
  await vi.waitFor(() =>
    expect(state.result).toHaveBeenCalledWith("s", "call", { content: "第一份 PDF" })
  );
  expect(execute).toHaveBeenCalledOnce();
  registry.unregisterSource("pdf-b");
});
