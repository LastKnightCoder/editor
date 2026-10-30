import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createEditor, Editor, Transforms } from "slate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  focused: true,
  viewport: {
    viewportTop: 0,
    viewportHeight: 488,
    keyboardHeight: 312,
    rawKeyboardHeight: 312,
    reservedHeight: 0,
    lastKeyboardHeight: 280,
    isKeyboardVisible: true,
  },
  reserve: vi.fn(),
  releaseWhenKeyboardShown: vi.fn(),
  releaseNow: vi.fn(),
  hide: vi.fn(),
  show: vi.fn(),
}));
vi.mock("slate-react", () => ({ ReactEditor: { isFocused: () => mocks.focused } }));
vi.mock("../../cards/editorToolbar/keyboardSwap", () => ({
  hideKeyboard: mocks.hide,
  showKeyboard: mocks.show,
}));
vi.mock("../../../components/KeyboardViewportProvider", async importOriginal => {
  const actual =
    await importOriginal<typeof import("../../../components/KeyboardViewportProvider")>();
  const reservation = {
    reserve: mocks.reserve,
    releaseWhenKeyboardShown: mocks.releaseWhenKeyboardShown,
    releaseNow: mocks.releaseNow,
  };
  return {
    ...actual,
    useKeyboardViewport: () => mocks.viewport,
    useKeyboardReservation: () => reservation,
  };
});

import { useDictationKeyboardSwap } from "../useDictationKeyboardSwap";

describe("语音面板与键盘等高切换", () => {
  let root: Root;
  let host: HTMLDivElement;
  let keyboard: ReturnType<typeof useDictationKeyboardSwap>;
  let editor: ReturnType<typeof createEditor>;
  const changed = vi.fn();

  function Harness() {
    keyboard = useDictationKeyboardSwap(changed);
    return null;
  }
  const render = () => act(() => root.render(<Harness />));

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.focused = true;
    Object.assign(mocks.viewport, {
      rawKeyboardHeight: 312,
      lastKeyboardHeight: 280,
      viewportHeight: 488,
      keyboardHeight: 312,
    });
    mocks.show.mockReset();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    editor = createEditor();
    editor.children = [{ type: "paragraph", children: [{ type: "formatted", text: "正文" }] }];
    editor.selection = {
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [0, 0], offset: 1 },
    };
    render();
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("先预留实测高度并保活入口，再收键盘；键盘消失不改变面板高度", () => {
    act(() => keyboard.begin(editor));
    expect(keyboard.panelHeight).toBe(312);
    expect(mocks.reserve).toHaveBeenCalledWith(312);
    expect(changed).toHaveBeenCalledWith(true);
    expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.hide.mock.invocationCallOrder[0]
    );
    expect(changed.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.hide.mock.invocationCallOrder[0]
    );
    mocks.viewport.rawKeyboardHeight = 0;
    render();
    expect(keyboard.panelHeight).toBe(312);
    expect(mocks.releaseNow).not.toHaveBeenCalled();
    act(() => keyboard.begin(editor));
    expect(mocks.hide).toHaveBeenCalledTimes(1);
  });

  it("恢复跟随文档变化的原选区，等待键盘接管高度后才释放预留", () => {
    act(() => keyboard.begin(editor));
    Transforms.insertText(editor, "前", { at: { path: [0, 0], offset: 0 } });
    act(() => keyboard.restore());
    expect(mocks.show).toHaveBeenCalledWith(editor, "blur", null, {
      anchor: { path: [0, 0], offset: 2 },
      focus: { path: [0, 0], offset: 2 },
    });
    expect(mocks.releaseWhenKeyboardShown).toHaveBeenCalledTimes(1);
    expect(mocks.releaseNow).not.toHaveBeenCalled();
    expect(changed).toHaveBeenLastCalledWith(false);
    expect(Editor.rangeRefs(editor).size).toBe(0);
    act(() => keyboard.restore());
    expect(mocks.show).toHaveBeenCalledTimes(1);
  });

  it("阅读态使用最近键盘高度，结束时不唤起软键盘", () => {
    mocks.focused = false;
    mocks.viewport.rawKeyboardHeight = 0;
    render();
    act(() => keyboard.begin(editor));
    expect(keyboard.panelHeight).toBe(280);
    expect(mocks.hide).not.toHaveBeenCalled();
    act(() => keyboard.restore());
    expect(mocks.show).not.toHaveBeenCalled();
    expect(mocks.releaseNow).toHaveBeenCalledTimes(1);
  });

  it("离开页面释放预留和选区引用，不重新聚焦离开的编辑器", () => {
    act(() => keyboard.begin(editor));
    act(() => root.render(null));
    expect(mocks.show).not.toHaveBeenCalled();
    expect(mocks.releaseNow).toHaveBeenCalledTimes(1);
    expect(Editor.rangeRefs(editor).size).toBe(0);
  });

  it("焦点恢复失败也释放预留，避免页面留下空白区域", () => {
    mocks.show.mockImplementationOnce(() => {
      throw new Error("编辑器已移除");
    });
    act(() => keyboard.begin(editor));
    act(() => keyboard.restore());
    expect(mocks.releaseNow).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenLastCalledWith(false);
  });
});
