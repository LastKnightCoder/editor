import { errorStateTranslator, useErrorStateI18n } from "@/components/ErrorState/i18n";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import { feedbackTranslator } from "../i18n";
import { FeedbackForm } from "../FeedbackForm";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { UiProvider } from "@tau/ui";
import { drawAnnotations, exportSize, rectFromDrag } from "../image";
import { useFeedbackDraft } from "../useFeedbackDraft";

const submitFeedback = vi.fn();
const reads = vi.hoisted(() => ({
  environment: vi.fn(async () => ({
    appVersion: "0.1.0",
    platform: "darwin",
    osVersion: "test-os",
    arch: "arm64",
    page: "user-page",
    locale: "zh-CN",
  })),
  logs: vi.fn(async () => ({ appLogBytes: 2048 })),
  sources: vi.fn(async () => []),
}));
vi.mock("@/platform", () => ({ isMac: true }));
vi.mock("@/commands/feedback", () => ({
  submitFeedback: (...args: unknown[]) => submitFeedback(...args),
  getFeedbackEnvironment: reads.environment,
  getFeedbackLogInfo: reads.logs,
  listCaptureSources: reads.sources,
  revealFeedbackLogs: () => Promise.resolve(),
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

it("错误报告换语不重发，重试复用请求ID与首次报告输入", async () => {
  const original = desktopLocaleSource.getSnapshot();
  const problem = new TypeError("boom");
  function LocalizedError() {
    const { t } = useErrorStateI18n();
    return <ErrorState error={problem} title={t("default.title")} />;
  }
  submitFeedback
    .mockResolvedValueOnce({
      ok: false,
      reason: "network",
      message: "没能连上服务器",
      code: "FEEDBACK_NETWORK_UNAVAILABLE",
    })
    .mockResolvedValueOnce({ ok: true, id: "f1" });
  const container = await mount(
    <UiProvider>
      <LocalizedError />
    </UiProvider>
  );
  try {
    const details = container.querySelector<HTMLButtonElement>("button[aria-expanded]");
    await act(async () => details?.click());
    const diagnostic = container.querySelector("pre");
    const report = button(container, new RegExp(errorStateTranslator.t("report.send")));
    if (!report) throw new Error("报告入口未挂载");
    await act(async () => report.click());
    expect(submitFeedback).toHaveBeenCalledTimes(1);
    const retry = button(container, new RegExp(errorStateTranslator.t("report.retry")));
    if (!retry) throw new Error("失败重试入口未挂载");
    const first = structuredClone(submitFeedback.mock.calls[0][0]);
    expect(first).toMatchObject({
      kind: "bug",
      includeContext: true,
      images: [],
      logs: { app: true, perf: false },
    });
    expect(first.message).toContain("TypeError: boom");
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(button(container, new RegExp(errorStateTranslator.t("report.retry")))).toBe(retry);
      expect(container.querySelector("pre")).toBe(diagnostic);
      expect(details?.getAttribute("aria-expanded")).toBe("true");
      expect(submitFeedback).toHaveBeenCalledTimes(1);
    }
    await act(async () => retry.click());
    expect(submitFeedback).toHaveBeenCalledTimes(2);
    expect(submitFeedback.mock.calls[1][0]).toEqual(first);
  } finally {
    await act(async () => desktopLocaleSource.setLocale(original));
  }
});

it("切换语言保留真实反馈输入、截图字节与请求ID，不重压缩、重取元数据或提交", async () => {
  const original = desktopLocaleSource.getSnapshot(),
    client = new QueryClient();
  const bitmap = { width: 800, height: 600, close: vi.fn() };
  const create = vi.fn(async () => bitmap);
  vi.stubGlobal("createImageBitmap", create);
  const context = { drawImage: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn() };
  const encode = vi.fn(async () => ({
    size: 3,
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  }));
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      getContext() {
        return context;
      }
      convertToBlob = encode;
    }
  );
  const createUrl = vi.fn(() => "blob:feedback-fixture"),
    revoke = vi.fn();
  const oldCreate = URL.createObjectURL,
    oldRevoke = URL.revokeObjectURL;
  URL.createObjectURL = createUrl;
  URL.revokeObjectURL = revoke;
  let draft!: ReturnType<typeof useFeedbackDraft>;
  const capture = vi.fn(),
    annotate = vi.fn(),
    issue = vi.fn(),
    send = vi.fn();
  function Probe() {
    draft = useFeedbackDraft();
    return (
      <QueryClientProvider client={client}>
        <FeedbackForm
          draft={draft}
          sending={false}
          error={null}
          onCapture={capture}
          onAnnotate={annotate}
          onError={issue}
          onSubmit={send}
        />
      </QueryClientProvider>
    );
  }
  try {
    await act(async () => desktopLocaleSource.setLocale("zh-CN"));
    const host = await mount(<Probe />);
    await act(async () => {
      draft.update({ kind: "idea", message: "用户反馈正文", logs: { app: true, perf: false } });
      await draft.addImage(new Blob(["fixture"], { type: "image/png" }), "用户文件.png");
    });
    const field = host.querySelector("textarea");
    if (!field) throw new Error("反馈输入未挂载");
    await act(async () => {
      field.focus();
      field.setSelectionRange(1, 4);
    });
    expect(draft.ready).toBe(true);
    const input = draft.toInput("paper · light"),
      shot = draft.screenshots[0],
      image = host.querySelector("img");
    if (!input.images[0]) throw new Error("截图压缩尚未完成");
    const calls = {
      environment: reads.environment.mock.calls.length,
      logs: reads.logs.mock.calls.length,
      decode: create.mock.calls.length,
      encode: encode.mock.calls.length,
      submit: submitFeedback.mock.calls.length,
    };
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(host.querySelector("textarea")).toBe(field);
      expect(field.value).toBe("用户反馈正文");
      expect(document.activeElement).toBe(field);
      expect([field.selectionStart, field.selectionEnd]).toEqual([1, 4]);
      expect(draft.fields.kind).toBe("idea");
      expect(draft.fields.logs).toEqual({ app: true, perf: false });
      expect(draft.screenshots[0]).toBe(shot);
      expect(host.querySelector("img")).toBe(image);
      expect(draft.toInput("paper · light").clientRequestId).toBe(input.clientRequestId);
      expect(draft.toInput("paper · light").images[0]).toBe(input.images[0]);
      expect(draft.toInput("paper · light").theme).toBe("paper · light");
      expect({
        environment: reads.environment.mock.calls.length,
        logs: reads.logs.mock.calls.length,
        decode: create.mock.calls.length,
        encode: encode.mock.calls.length,
        submit: submitFeedback.mock.calls.length,
      }).toEqual(calls);
      expect(capture).not.toHaveBeenCalled();
      expect(annotate).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      const selected = [...host.querySelectorAll("button")].find(
        node => node.textContent?.trim() === feedbackTranslator.t("kind.idea")
      );
      expect(selected?.getAttribute("aria-pressed")).toBe("true");
    }
  } finally {
    if (mounted) {
      await act(async () => mounted?.root.unmount());
      mounted.container.remove();
      mounted = null;
    }
    await act(async () => desktopLocaleSource.setLocale(original));
    client.clear();
    vi.unstubAllGlobals();
    URL.createObjectURL = oldCreate;
    URL.revokeObjectURL = oldRevoke;
  }
});
