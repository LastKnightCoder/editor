import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../editorExtensions/ContentLinkPickerSheet", () => ({
  __esModule: true,
  default: () => null,
}));

const sourceInputMocks = vi.hoisted(() => ({
  insertIntoTextControl: vi.fn(),
}));

vi.mock("../editorToolbar/sourceEditorInput", async importOriginal => ({
  ...(await importOriginal<typeof import("../editorToolbar/sourceEditorInput")>()),
  ...sourceInputMocks,
}));

import {
  MobileEditorBottomToolbar,
  type AccessoryItemId,
} from "../editorToolbar/MobileEditorBottomToolbar";
import type { EditingContext } from "../editorToolbar/editingContext";
import type { MobileEditorToolbarController } from "../editorToolbar/useMobileEditorToolbarController";
import { createControllerStub } from "./toolbarControllerStub";

function getToolbar(): HTMLElement | null {
  return document.querySelector('[data-mobile-editor-toolbar="true"]');
}

function getToolbarButton(label: string): HTMLButtonElement | null {
  return (
    Array.from(getToolbar()?.querySelectorAll("button") ?? []).find(
      button => button.getAttribute("aria-label") === label
    ) ?? null
  );
}

function getToolbarLabels(): string[] {
  return Array.from(getToolbar()?.querySelectorAll("button") ?? []).map(
    button => button.getAttribute("aria-label") ?? button.textContent ?? ""
  );
}

function getStaticChip(): HTMLElement | null {
  return getToolbar()?.querySelector('[data-context-chip="static"]') ?? null;
}

function dispatch(target: Element | null | undefined, type: string): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true });
  act(() => {
    target?.dispatchEvent(event);
  });
  return event;
}

const MATH_LABELS = [
  "\\",
  "^",
  "_",
  "{ }",
  "( )",
  "\\frac",
  "\\sqrt",
  "\\sum",
  "\\int",
  "\\alpha",
  "\\pi",
  "=",
];

describe("MobileEditorBottomToolbar 公式上下文", () => {
  let container: HTMLDivElement;
  let root: Root;
  let sourceInput: HTMLTextAreaElement;
  let mathInput: HTMLInputElement;

  const blockMath = (): EditingContext => ({ kind: "block-math", path: [1], input: sourceInput });
  const inlineMath = (): EditingContext => ({
    kind: "inline-math",
    path: [0, 1],
    input: mathInput,
  });

  const sourceController = (editingContext: EditingContext) =>
    createControllerStub({ isEditorFocused: false, isToolbarVisible: true, editingContext });

  const render = (
    controller: MobileEditorToolbarController,
    visibleButtons?: ReadonlySet<AccessoryItemId>
  ) => {
    act(() => {
      root.render(
        <MobileEditorBottomToolbar controller={controller} visibleButtons={visibleButtons} />
      );
    });
  };

  beforeEach(() => {
    sourceInput = document.createElement("textarea");
    mathInput = document.createElement("input");
    document.body.append(sourceInput, mathInput);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("块公式与行内公式：静态「公式」标签、公式符号键、收起键盘", () => {
    for (const context of [blockMath(), inlineMath()]) {
      render(sourceController(context));
      expect(getStaticChip()?.textContent).toBe("公式");
      expect(getStaticChip()?.querySelector("svg")).toBeTruthy();
      expect(getToolbarLabels()).toEqual([...MATH_LABELS, "收起键盘"]);
    }
  });

  it("标签不可点：按下保持焦点，不退回通用模式", () => {
    const controller = sourceController(blockMath());
    render(controller);
    const chip = getStaticChip();
    expect(chip?.tagName).toBe("SPAN");
    expect(dispatch(chip, "pointerdown").defaultPrevented).toBe(true);
    expect(dispatch(chip, "mousedown").defaultPrevented).toBe(true);
    dispatch(chip, "click");
    expect(controller.dismissEditingContext).not.toHaveBeenCalled();
  });

  it("符号键按下阻止默认行为，不抢走源码编辑器焦点", () => {
    render(sourceController(blockMath()));
    for (const label of ["\\frac", "{ }", "收起键盘"]) {
      const button = getToolbarButton(label);
      expect(dispatch(button, "pointerdown").defaultPrevented, label).toBe(true);
      expect(dispatch(button, "mousedown").defaultPrevented, label).toBe(true);
      dispatch(button, "pointerup");
    }
  });

  it("块公式的键插入源码输入框，模板带光标偏移", () => {
    render(sourceController(blockMath()));
    act(() => getToolbarButton("\\frac")?.click());
    expect(sourceInputMocks.insertIntoTextControl).toHaveBeenLastCalledWith(
      sourceInput,
      "\\frac{}{}",
      6
    );
    act(() => getToolbarButton("\\alpha")?.click());
    expect(sourceInputMocks.insertIntoTextControl).toHaveBeenLastCalledWith(
      sourceInput,
      "\\alpha",
      undefined
    );
  });

  it("行内公式的键插入 input", () => {
    render(sourceController(inlineMath()));
    act(() => getToolbarButton("{ }")?.click());
    expect(sourceInputMocks.insertIntoTextControl).toHaveBeenLastCalledWith(mathInput, "{}", 1);
    act(() => getToolbarButton("\\sqrt")?.click());
    expect(sourceInputMocks.insertIntoTextControl).toHaveBeenLastCalledWith(
      mathInput,
      "\\sqrt{}",
      6
    );
  });

  it("收起键盘：当前焦点失焦并退出编辑", () => {
    const controller = sourceController(inlineMath());
    render(controller);
    mathInput.focus();
    expect(document.activeElement).toBe(mathInput);
    act(() => getToolbarButton("收起键盘")?.click());
    expect(document.activeElement).not.toBe(mathInput);
    expect(controller.exitEditing).toHaveBeenCalled();
  });

  it("白名单控制公式模式，未列入时按通用模式渲染", () => {
    const onlyMath = new Set<AccessoryItemId>(["context-math", "undo"]);
    render(sourceController(blockMath()), onlyMath);
    expect(getStaticChip()?.textContent).toBe("公式");

    render(sourceController(inlineMath()), new Set<AccessoryItemId>(["undo"]));
    expect(getStaticChip()).toBeNull();
    expect(getToolbarLabels()).toEqual(["撤销", "收起键盘"]);
  });

  it("面板打开时不显示公式上下文", () => {
    render(createControllerStub({ editingContext: blockMath(), activePanel: "style" }));
    expect(getStaticChip()).toBeNull();
    expect(getToolbarButton("键盘")).toBeTruthy();
  });
});
