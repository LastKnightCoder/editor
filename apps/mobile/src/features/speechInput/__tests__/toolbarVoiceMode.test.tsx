import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../cards/editorExtensions/ContentLinkPickerSheet", () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock("../../../components/KeyboardViewportProvider", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../components/KeyboardViewportProvider")>()),
  useKeyboardViewport: () => ({
    viewportHeight: 544,
    keyboardHeight: 300,
    isKeyboardVisible: true,
    rawKeyboardHeight: 300,
    reservedHeight: 300,
    lastKeyboardHeight: 300,
  }),
}));

import {
  MobileEditorBottomToolbar,
  type AccessoryItemId,
} from "../../cards/editorToolbar/MobileEditorBottomToolbar";
import type { MobileEditorToolbarController } from "../../cards/editorToolbar/useMobileEditorToolbarController";
import { createControllerStub } from "../../cards/__tests__/toolbarControllerStub";

const VOICE = "语音输入";
const KEYBOARD = "切换到键盘";

describe("配件栏输入方式切换键", () => {
  let host: HTMLDivElement;
  let root: Root;

  const render = (
    controller: MobileEditorToolbarController,
    extraProps: { readonly?: boolean; visibleButtons?: ReadonlySet<AccessoryItemId> } = {}
  ) => {
    act(() => {
      root.render(<MobileEditorBottomToolbar controller={controller} {...extraProps} />);
    });
  };
  const button = (label: string) =>
    document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

  beforeEach(() => {
    window.localStorage.setItem("tau.mobile.voice-mode-coach-seen", "1");
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("通用模式在「插入」左侧显示，点一下打开等高语音面板", () => {
    const controller = createControllerStub();
    render(controller);
    const mic = button(VOICE)!;
    const plus = button("插入")!;
    expect(mic.compareDocumentPosition(plus) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    act(() => {
      mic.dispatchEvent(mouseDown);
    });
    expect(mouseDown.defaultPrevented).toBe(true);
    act(() => mic.click());
    expect(controller.openPanel).toHaveBeenCalledWith("voice", 300);
  });

  it("语音面板打开时切换键变为键盘，点击回到键盘", () => {
    const controller = createControllerStub({ activePanel: "voice" });
    render(controller);
    expect(button(VOICE)).toBeNull();
    expect(document.querySelector('[data-mobile-editor-panel="voice"]')).toBeTruthy();
    expect(button("开始说话")).toBeTruthy();
    act(() => button(KEYBOARD)!.click());
    expect(controller.closePanel).toHaveBeenCalledWith({
      showKeyboard: true,
      restoreSelection: true,
    });
  });

  it("首次显示引导气泡，点掉后不再出现", () => {
    window.localStorage.clear();
    render(createControllerStub());
    const coach = () =>
      [...document.querySelectorAll("button")].find(node =>
        node.textContent?.includes("用说的输入")
      );
    expect(coach()).toBeTruthy();
    act(() => coach()!.click());
    expect(coach()).toBeUndefined();
    expect(window.localStorage.getItem("tau.mobile.voice-mode-coach-seen")).toBe("1");
  });

  it("格式模式不显示", () => {
    render(createControllerStub({ editingContext: { kind: "selection" } }));
    expect(button(VOICE)).toBeNull();
  });

  it("表格上下文不显示", () => {
    render(
      createControllerStub({
        editingContext: { kind: "table", tablePath: [0], row: 0, col: 0, rowCount: 2, colCount: 2 },
      })
    );
    expect(button(VOICE)).toBeNull();
  });

  it("只读时不显示", () => {
    render(createControllerStub(), { readonly: true });
    expect(button(VOICE)).toBeNull();
  });

  it("白名单不含 dictation 时不显示，含时显示", () => {
    render(createControllerStub(), { visibleButtons: new Set<AccessoryItemId>(["undo"]) });
    expect(button(VOICE)).toBeNull();
    render(createControllerStub(), {
      visibleButtons: new Set<AccessoryItemId>(["undo", "dictation"]),
    });
    expect(button(VOICE)).toBeTruthy();
  });
});
