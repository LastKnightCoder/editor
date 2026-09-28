import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  listener: null as any,
  cancel: null as any,
  result: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/tools", async () => ({
  default: (await import("../../tools/toolRegistry")).default,
  ensureToolingReady: () => {},
}));
vi.mock("../piInteractions", () => ({ initPiInteractions: () => {} }));
vi.mock("@/commands/piSession", () => ({
  onPiToolCall: (fn: any) => (state.listener = fn),
  onPiToolCancel: (fn: any) => (state.cancel = fn),
  piSessionToolResult: state.result,
  piSessionToolError: state.error,
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
  registerPiToolSessionContext("s", {
    databaseName: "test",
    scopedTools: registry.getScopedTools("pdf-a"),
  });
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
    expect(state.result).toHaveBeenCalledWith("s", "call", { content: "第一份 PDF" }, undefined)
  );
  expect(execute).toHaveBeenCalledOnce();
  registry.unregisterSource("pdf-b");
});

it("全局同名工具替换不能更改已有会话的执行器", async () => {
  const original = vi.fn(async () => ({ content: "原只读结果" }));
  const replacement = vi.fn(async () => ({ content: "不应写入" }));
  const definition = {
    name: "review_lookup",
    description: "查询",
    parameters: { type: "object" as const, properties: {} },
    executor: original,
    risk: "read" as const,
  };
  registry.registerTools("review-source", [definition]);
  registerPiToolSessionContext("snapshot", {
    databaseName: "test",
    sessionTools: registry.getRegisteredTools().filter(tool => tool.name === definition.name),
  });
  registry.registerTools("review-source", [
    { ...definition, risk: "write", executor: replacement },
  ]);
  initPiToolBridge();
  state.listener({
    sessionId: "snapshot",
    toolCallId: "stable",
    toolName: definition.name,
    args: {},
  });
  await vi.waitFor(() => expect(original).toHaveBeenCalledOnce());
  expect(replacement).not.toHaveBeenCalled();
  registry.unregisterSource("review-source");
});

it("取消跨过工具桥传入执行器，取消后不会继续写入", async () => {
  const write = vi.fn();
  const tool = {
    name: "slow",
    source: "test",
    enabled: true,
    description: "延迟写入",
    parameters: { type: "object" as const, properties: {} },
    executor: async (_args: unknown, context: any) => {
      await new Promise<void>((_resolve, reject) =>
        context.signal.addEventListener("abort", () => reject(new Error("已取消")), { once: true })
      );
      write();
      return "完成";
    },
  };
  registerPiToolSessionContext("cancel", { databaseName: "test", sessionTools: [tool] });
  state.listener({ sessionId: "cancel", toolCallId: "slow-call", toolName: "slow", args: {} });
  state.cancel({ sessionId: "cancel", toolCallId: "slow-call" });
  await vi.waitFor(() =>
    expect(state.error).toHaveBeenCalledWith("cancel", "slow-call", "已取消", undefined)
  );
  expect(write).not.toHaveBeenCalled();
});
