import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../editorExtensions/ContentLinkPickerSheet", () => ({
  __esModule: true,
  default: () => null,
}));

const sourceInputMocks = vi.hoisted(() => ({
  insertSourceText: vi.fn(),
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

const MERMAID_LABELS = ["-->", "---", "-.->", "[ ]", "( )", "{ }", "|", ":", ";", "换行缩进"];

describe("MobileEditorBottomToolbar 公式 / 流程图上下文", () => {
  let container: HTMLDivElement;
  let root: Root;
  let sourceHost: HTMLDivElement;
  let mathInput: HTMLInputElement;

  const blockMath = (): EditingContext => ({ kind: "block-math", path: [1], host: sourceHost });
  const mermaid = (): EditingContext => ({ kind: "mermaid", path: [1], host: sourceHost });
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
    sourceHost = document.createElement("div");
    mathInput = document.createElement("input");
    document.body.append(sourceHost, mathInput);
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

  it("流程图：静态「流程图」标签与流程图符号键", () => {
    render(sourceController(mermaid()));
    expect(getStaticChip()?.textContent).toBe("流程图");
    expect(getToolbarLabels()).toEqual([...MERMAID_LABELS, "收起键盘"]);
    expect(getToolbarButton("换行缩进")?.textContent).toBe("↵");
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
    render(sourceController(mermaid()));
    for (const label of ["-->", "[ ]", "换行缩进", "收起键盘"]) {
      const button = getToolbarButton(label);
      expect(dispatch(button, "pointerdown").defaultPrevented, label).toBe(true);
      expect(dispatch(button, "mousedown").defaultPrevented, label).toBe(true);
      dispatch(button, "pointerup");
    }
  });

  it("块公式 / 流程图的键插入 CodeMirror，模板带光标偏移", () => {
    render(sourceController(blockMath()));
    act(() => getToolbarButton("\\frac")?.click());
    expect(sourceInputMocks.insertSourceText).toHaveBeenLastCalledWith(sourceHost, "\\frac{}{}", {
      cursorOffset: 6,
    });
    act(() => getToolbarButton("\\alpha")?.click());
    expect(sourceInputMocks.insertSourceText).toHaveBeenLastCalledWith(sourceHost, "\\alpha", {
      cursorOffset: undefined,
    });

    render(sourceController(mermaid()));
    act(() => getToolbarButton("[ ]")?.click());
    expect(sourceInputMocks.insertSourceText).toHaveBeenLastCalledWith(sourceHost, "[]", {
      cursorOffset: 1,
    });
    act(() => getToolbarButton("换行缩进")?.click());
    expect(sourceInputMocks.insertSourceText).toHaveBeenLastCalledWith(sourceHost, "\n    ", {
      cursorOffset: undefined,
    });
    expect(sourceInputMocks.insertIntoTextControl).not.toHaveBeenCalled();
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
    expect(sourceInputMocks.insertSourceText).not.toHaveBeenCalled();
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

  it("白名单分别控制公式与流程图模式，未列入时按通用模式渲染", () => {
    const onlyMath = new Set<AccessoryItemId>(["context-math", "undo"]);
    render(sourceController(blockMath()), onlyMath);
    expect(getStaticChip()?.textContent).toBe("公式");

    render(sourceController(mermaid()), onlyMath);
    expect(getStaticChip()).toBeNull();
    expect(getToolbarLabels()).toEqual(["撤销", "收起键盘"]);

    const onlyMermaid = new Set<AccessoryItemId>(["context-mermaid", "undo"]);
    render(sourceController(inlineMath()), onlyMermaid);
    expect(getStaticChip()).toBeNull();
    render(sourceController(mermaid()), onlyMermaid);
    expect(getStaticChip()?.textContent).toBe("流程图");
  });

  it("面板打开时不显示公式上下文", () => {
    render(createControllerStub({ editingContext: blockMath(), activePanel: "style" }));
    expect(getStaticChip()).toBeNull();
    expect(getToolbarButton("键盘")).toBeTruthy();
  });
});
