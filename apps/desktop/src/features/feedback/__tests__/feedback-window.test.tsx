// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { FeedbackDraft } from "../useFeedbackDraft";

const state = vi.hoisted(() => ({
  closeRequested: null as (() => void) | null,
  hide: vi.fn(),
  submit: vi.fn(),
  draft: null as FeedbackDraft | null,
}));

vi.mock("@/commands/feedback", () => ({
  hideFeedbackWindow: state.hide,
  onFeedbackCloseRequested: (listener: () => void) => {
    state.closeRequested = listener;
    return () => {
      state.closeRequested = null;
    };
  },
  onPendingCaptures: () => () => {},
  takePendingCaptures: async () => [],
  submitFeedback: state.submit,
}));
vi.mock("@/app/useThemeRuntime", () => ({ useThemeRuntime: () => {} }));
vi.mock("@/app/AuxWindowTitlebar", () => ({ AuxWindowTitlebar: () => null }));
vi.mock("@/platform", () => ({ platform: { window: {} } }));
vi.mock("../AnnotateView", () => ({ AnnotateView: () => null }));
vi.mock("../FeedbackForm", () => ({
  FeedbackForm: ({ draft, onSubmit }: { draft: FeedbackDraft; onSubmit: () => void }) => {
    state.draft = draft;
    return <button onClick={onSubmit}>测试发送</button>;
  },
}));

import FeedbackWindow from "../windows/FeedbackWindow";

let root: Root | null = null;
let container: HTMLDivElement;
async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<FeedbackWindow />));
}
const click = async (text: string) => {
  const target = [...container.querySelectorAll("button")].find(
    button => button.textContent === text
  );
  expect(target).toBeDefined();
  await act(async () => target!.click());
};

afterEach(async () => {
  await act(async () => root?.unmount());
  container.remove();
  root = null;
  vi.clearAllMocks();
});

it("有草稿时先确认，继续编辑保留内容，放弃后清空并隐藏，下一条仍需确认", async () => {
  await mount();
  act(() => state.draft!.update({ message: "未发送内容" }));
  act(() => state.closeRequested!());
  expect(container.textContent).toContain("放弃这条反馈？");
  expect(state.hide).not.toHaveBeenCalled();
  await click("继续编辑");
  expect(state.draft!.fields.message).toBe("未发送内容");
  act(() => state.closeRequested!());
  await click("放弃");
  expect(state.hide).toHaveBeenCalledOnce();
  expect(state.draft!.fields.message).toBe("");
  act(() => state.draft!.update({ message: "新草稿" }));
  act(() => state.closeRequested!());
  expect(container.textContent).toContain("放弃这条反馈？");
  expect(state.hide).toHaveBeenCalledOnce();
});

it("空表单直接隐藏，发送成功关闭后恢复空表单", async () => {
  state.submit.mockResolvedValue({ ok: true, id: "feedback-1" });
  await mount();
  await act(async () => state.closeRequested!());
  expect(state.hide).toHaveBeenCalledOnce();
  act(() => state.draft!.update({ message: "一条反馈" }));
  await click("测试发送");
  expect(container.textContent).toContain("反馈已发送，谢谢你");
  await click("关闭");
  expect(state.hide).toHaveBeenCalledTimes(2);
  expect(state.draft!.fields.message).toBe("");
  expect(container.textContent).not.toContain("反馈已发送，谢谢你");
});

it("发送中放弃并关闭后，迟到的回执不覆盖新表单", async () => {
  let resolve!: (result: { ok: true; id: string }) => void;
  state.submit.mockReturnValue(
    new Promise(done => {
      resolve = done;
    })
  );
  await mount();
  act(() => state.draft!.update({ message: "旧反馈" }));
  await click("测试发送");
  act(() => state.closeRequested!());
  await click("放弃");
  act(() => state.draft!.update({ message: "新反馈" }));
  await act(async () => resolve({ ok: true, id: "old-feedback" }));
  expect(state.draft!.fields.message).toBe("新反馈");
  expect(container.textContent).not.toContain("反馈已发送，谢谢你");
});
