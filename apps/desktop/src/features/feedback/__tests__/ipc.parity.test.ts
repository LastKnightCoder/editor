// @vitest-environment node
import { expect, it, vi } from "vitest";
import {
  FeedbackCommandError,
  feedbackResult,
} from "../../../../src-electron/main/services/app-feedback";
import { captureWindow, submitFeedback } from "../../../commands/feedback";
import { FeedbackHostError } from "../errors";
const wire = vi.hoisted(() => vi.fn());
vi.mock("@/electron", () => ({ invoke: wire }));

it("捕获失败跨IPC后保留错误代码、原诊断和参数，调用者仍收到拒绝", async () => {
  const message = "原始窗口诊断";
  const encoded = await feedbackResult(() => {
    throw new FeedbackCommandError("FEEDBACK_WINDOW_UNAVAILABLE", message, { windowId: 17 });
  });
  wire.mockResolvedValueOnce(structuredClone(encoded));
  let received: unknown;
  try {
    await captureWindow(17);
  } catch (error) {
    received = error;
  }
  expect(received).toBeInstanceOf(FeedbackHostError);
  expect(received).toMatchObject({
    code: "FEEDBACK_WINDOW_UNAVAILABLE",
    message,
    params: { windowId: 17 },
  });
  expect(wire).toHaveBeenLastCalledWith("app-feedback:capture", 17);
});

it("服务端声明的提交失败仍作为响应返回，不被误判为命令异常", async () => {
  const encoded = await feedbackResult(() => ({
    ok: false as const,
    reason: "limit" as const,
    message: "服务端原始诊断",
  }));
  wire.mockResolvedValueOnce(structuredClone(encoded));
  const input = {
    kind: "bug" as const,
    message: "用户正文",
    clientRequestId: "request-identifier",
    includeContext: true,
    theme: "paper · light",
    images: [],
    logs: { app: false, perf: false },
  };
  const result = await submitFeedback(input);
  expect(result).toEqual({ ok: false, reason: "limit", message: "服务端原始诊断" });
  expect(wire).toHaveBeenLastCalledWith("app-feedback:submit", input);
});
