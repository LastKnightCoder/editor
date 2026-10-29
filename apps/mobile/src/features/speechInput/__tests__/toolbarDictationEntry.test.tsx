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
    reservedHeight: 0,
    lastKeyboardHeight: 300,
  }),
}));

import {
  MobileEditorBottomToolbar,
  type AccessoryItemId,
} from "../../cards/editorToolbar/MobileEditorBottomToolbar";
import type { MobileEditorToolbarController } from "../../cards/editorToolbar/useMobileEditorToolbarController";
import { createControllerStub } from "../../cards/__tests__/toolbarControllerStub";

const LABEL = "按住说话";

describe("配件栏「按住说话」入口", () => {
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
  const micButton = () =>
    document.querySelector<HTMLButtonElement>(`button[aria-label="${LABEL}"]`);

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("通用模式显示，按下时 preventDefault 不抢编辑器焦点", () => {
    render(createControllerStub());
    const button = micButton();
    expect(button).toBeTruthy();
    expect(button?.getAttribute("aria-pressed")).toBe("false");

    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    act(() => {
      button?.dispatchEvent(mouseDown);
    });
    expect(mouseDown.defaultPrevented).toBe(true);

    const pointerDown = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(pointerDown, "pointerId", { value: 1 });
    act(() => {
      button?.dispatchEvent(pointerDown);
    });
    expect(pointerDown.defaultPrevented).toBe(true);
    act(() => {
      const up = new MouseEvent("pointerup", { bubbles: true });
      Object.defineProperty(up, "pointerId", { value: 1 });
      window.dispatchEvent(up);
    });
  });

  it("格式模式不显示", () => {
    render(createControllerStub({ editingContext: { kind: "selection" } }));
    expect(micButton()).toBeNull();
  });

  it("表格上下文不显示", () => {
    render(
      createControllerStub({
        editingContext: { kind: "table", tablePath: [0], row: 0, col: 0, rowCount: 2, colCount: 2 },
      })
    );
    expect(micButton()).toBeNull();
  });

  it("面板打开时不显示", () => {
    render(createControllerStub({ activePanel: "style" }));
    expect(micButton()).toBeNull();
  });

  it("只读时不显示", () => {
    render(createControllerStub(), { readonly: true });
    expect(micButton()).toBeNull();
  });

  it("白名单不含 dictation 时不显示，含时显示", () => {
    render(createControllerStub(), { visibleButtons: new Set<AccessoryItemId>(["undo"]) });
    expect(micButton()).toBeNull();
    render(createControllerStub(), {
      visibleButtons: new Set<AccessoryItemId>(["undo", "dictation"]),
    });
    expect(micButton()).toBeTruthy();
  });
});
