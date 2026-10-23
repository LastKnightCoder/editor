import { createEditor, type BaseSelection } from "slate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { blurMock, restoreMock } = vi.hoisted(() => ({
  blurMock: vi.fn(),
  restoreMock: vi.fn(),
}));

vi.mock("slate-react", () => ({ ReactEditor: { blur: blurMock } }));
vi.mock("../toolbarActions", () => ({ restoreSelectionAndFocus: restoreMock }));

import {
  INPUTMODE_FALLBACK_MS,
  clearKeyboardSwap,
  hideKeyboard,
  showKeyboard,
} from "../keyboardSwap";

const SAVED: BaseSelection = {
  anchor: { path: [0, 0], offset: 1 },
  focus: { path: [0, 0], offset: 1 },
};

describe("keyboardSwap", () => {
  let element: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    element = document.createElement("div");
    document.body.appendChild(element);
  });

  afterEach(() => {
    vi.useRealTimers();
    blurMock.mockReset();
    restoreMock.mockReset();
    document.body.innerHTML = "";
  });

  it("blur 策略收键盘调用 ReactEditor.blur，不写 inputmode", () => {
    const editor = createEditor();
    hideKeyboard(editor, "blur", element);
    expect(blurMock).toHaveBeenCalledWith(editor);
    expect(element.hasAttribute("inputmode")).toBe(false);
  });

  it("inputmode 策略收键盘设置 inputmode=none，不失焦", () => {
    hideKeyboard(createEditor(), "inputmode", element);
    expect(element.getAttribute("inputmode")).toBe("none");
    expect(blurMock).not.toHaveBeenCalled();
  });

  it("回键盘移除 inputmode 并恢复选区", () => {
    const editor = createEditor();
    element.setAttribute("inputmode", "none");
    showKeyboard(editor, "blur", element, SAVED);
    expect(element.hasAttribute("inputmode")).toBe(false);
    expect(restoreMock).toHaveBeenCalledWith(editor, SAVED);
    vi.advanceTimersByTime(INPUTMODE_FALLBACK_MS);
    expect(restoreMock).toHaveBeenCalledTimes(1);
  });

  it("restoreSelection=false 时不恢复选区", () => {
    showKeyboard(createEditor(), "blur", element, SAVED, { restoreSelection: false });
    expect(restoreMock).not.toHaveBeenCalled();
  });

  it("inputmode 策略下键盘未弹出时失焦重聚焦并回调 onFallback", () => {
    const editor = createEditor();
    const blurSpy = vi.spyOn(element, "blur");
    const onFallback = vi.fn();
    showKeyboard(editor, "inputmode", element, SAVED, {
      restoreSelection: false,
      isKeyboardShown: () => false,
      onFallback,
    });
    expect(restoreMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(INPUTMODE_FALLBACK_MS);
    expect(blurSpy).toHaveBeenCalledTimes(1);
    expect(restoreMock).toHaveBeenCalledWith(editor, SAVED);
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it("inputmode 策略下键盘已弹出时不兜底", () => {
    const onFallback = vi.fn();
    showKeyboard(createEditor(), "inputmode", element, SAVED, {
      isKeyboardShown: () => true,
      onFallback,
    });
    vi.advanceTimersByTime(INPUTMODE_FALLBACK_MS);
    expect(onFallback).not.toHaveBeenCalled();
    expect(restoreMock).toHaveBeenCalledTimes(1);
  });

  it("取消函数清除待执行的兜底", () => {
    const onFallback = vi.fn();
    const cancel = showKeyboard(createEditor(), "inputmode", element, SAVED, {
      isKeyboardShown: () => false,
      onFallback,
    });
    cancel();
    vi.advanceTimersByTime(INPUTMODE_FALLBACK_MS);
    expect(onFallback).not.toHaveBeenCalled();
  });

  it("clearKeyboardSwap 移除 inputmode 属性", () => {
    element.setAttribute("inputmode", "none");
    clearKeyboardSwap(element);
    expect(element.hasAttribute("inputmode")).toBe(false);
  });
});
