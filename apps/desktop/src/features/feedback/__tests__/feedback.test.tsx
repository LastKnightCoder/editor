// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { UiProvider } from "@tau/ui";
import { drawAnnotations, exportSize, rectFromDrag } from "../image";
import { useFeedbackDraft } from "../useFeedbackDraft";

const submitFeedback = vi.fn();
vi.mock("@/commands/feedback", () => ({
  submitFeedback: (...args: unknown[]) => submitFeedback(...args),
}));
vi.mock("@/electron", () => ({ isElectron: true }));

import { ErrorState, errorReportMessage } from "@/components/ErrorState";

let mounted: { root: Root; container: HTMLElement } | null = null;
async function mount(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(node));
  mounted = { root, container };
  return container;
}
afterEach(async () => {
  if (mounted) {
    const { root, container } = mounted;
    await act(async () => root.unmount());
    container.remove();
    mounted = null;
  }
  submitFeedback.mockReset();
});

function useHarness<T>(hook: () => T) {
  const result = { current: undefined as T };
  function Probe() {
    result.current = hook();
    return null;
  }
  return { result, Probe };
}
const button = (container: HTMLElement, text: RegExp) =>
  [...container.querySelectorAll("button")].find(item => text.test(item.textContent ?? ""));

it("拖拽矩形归一化、夹到画面内，误点不成框", () => {
  expect(rectFromDrag("box", { x: 0.8, y: 0.6 }, { x: 0.2, y: 1.4 })).toEqual({
    kind: "box",
    x: 0.2,
    y: 0.6,
    width: 0.6000000000000001,
    height: 0.4,
  });
  expect(rectFromDrag("mask", { x: 0.5, y: 0.5 }, { x: 0.501, y: 0.6 })).toBeNull();
});

it("导出长边不超过 1920，小图不放大", () => {
  expect(exportSize(2880, 1800)).toEqual({ width: 1920, height: 1200 });
  expect(exportSize(800, 600)).toEqual({ width: 800, height: 600 });
});

it("打码先画、框选后画，按输出尺寸换算", () => {
  const calls: string[] = [];
  const context = {
    fillRect: (...args: number[]) => calls.push(`fill ${args.join(",")}`),
    strokeRect: (...args: number[]) => calls.push(`stroke ${args.join(",")}`),
  } as unknown as CanvasRenderingContext2D;
  drawAnnotations(
    context,
    [
      { kind: "box", x: 0.5, y: 0.5, width: 0.25, height: 0.25 },
      { kind: "mask", x: 0, y: 0, width: 0.5, height: 0.1 },
    ],
    400,
    200,
    { box: "red", mask: "gray" }
  );
  expect(calls).toEqual(["fill 0,0,200,20", "stroke 200,100,100,50"]);
});

it("草稿原样重试复用请求 ID，改了内容换新 ID", async () => {
  const { result, Probe } = useHarness(useFeedbackDraft);
  await mount(<Probe />);
  act(() => result.current.update({ message: "卡住了" }));
  const first = result.current.toInput("paper · light").clientRequestId;
  expect(result.current.toInput("paper · light").clientRequestId).toBe(first);
  act(() => result.current.update({ logs: { app: true, perf: false } }));
  expect(result.current.toInput("paper · light").clientRequestId).not.toBe(first);
  expect(result.current.ready).toBe(true);
  act(() => result.current.update({ message: "  " }));
  expect(result.current.ready).toBe(false);
});

it("错误报告正文超长时截断堆栈", () => {
  const message = errorReportMessage("出了点问题", "TypeError: x", "s".repeat(5000));
  expect(message.startsWith("【错误报告】出了点问题\nTypeError: x\n\nsss")).toBe(true);
  expect(message.length).toBe(4000);
});

it("错误页一键发送错误报告，附带运行日志，重试复用请求 ID", async () => {
  submitFeedback
    .mockResolvedValueOnce({ ok: false, reason: "network", message: "没能连上服务器" })
    .mockResolvedValueOnce({ ok: true, id: "f1" });
  const container = await mount(
    <UiProvider>
      <ErrorState error={new TypeError("boom")} title="出了点问题" />
    </UiProvider>
  );
  await act(async () => button(container, /发送错误报告/)?.click());
  await act(async () => button(container, /发送失败，重试/)?.click());
  expect(container.textContent).toContain("已发送，谢谢");
  const [first, second] = submitFeedback.mock.calls.map(([input]) => input);
  expect(first).toMatchObject({
    kind: "bug",
    includeContext: true,
    images: [],
    logs: { app: true, perf: false },
  });
  expect(first.message).toContain("TypeError: boom");
  expect(second.clientRequestId).toBe(first.clientRequestId);
});
