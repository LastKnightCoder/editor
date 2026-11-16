import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor, createEditor, type BaseSelection, type Descendant } from "slate";
import { ReactEditor } from "slate-react";
import { restoreSelectionAndFocus } from "../editorToolbar/toolbarActions";
import type { MobileEditorToolbarController } from "../editorToolbar/useMobileEditorToolbarController";
import {
  ControllerProbe,
  createEditorRef,
  createFormattedEditor,
  createListEditor,
  renderControllerOn,
  requireController,
  setupToolbarControllerHost,
  teardownToolbarControllerHost,
} from "./mobileEditorToolbarController.testUtils";

const { openLocalMediaPickerMock, openMediaUrlInputMock } = vi.hoisted(() => ({
  openLocalMediaPickerMock: vi.fn(),
  openMediaUrlInputMock: vi.fn(),
}));
const openLinkPanel = vi.hoisted(() => vi.fn());
vi.mock("@tau/editor/extensions/link", async importOriginal => ({
  ...(await importOriginal<typeof import("@tau/editor/extensions/link")>()),
  openLinkPanel,
}));
vi.mock("@tau/editor/extensions/media", async importOriginal => ({
  ...(await importOriginal<typeof import("@tau/editor/extensions/media")>()),
  openLocalMediaPicker: (...args: unknown[]) => openLocalMediaPickerMock(...args),
  openMediaUrlInput: (...args: unknown[]) => openMediaUrlInputMock(...args),
}));

const reservation = vi.hoisted(() => ({
  reserve: vi.fn(),
  releaseWhenKeyboardShown: vi.fn(),
  releaseNow: vi.fn(),
}));
vi.mock("../../../components/KeyboardViewportProvider", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../components/KeyboardViewportProvider")>()),
  useKeyboardReservation: () => reservation,
}));

describe("useMobileEditorToolbarController", () => {
  let root: Root;

  beforeEach(() => {
    root = setupToolbarControllerHost();
  });

  afterEach(() => {
    teardownToolbarControllerHost(root);
  });

  function renderController(editor: Editor) {
    return renderControllerOn(root, editor);
  }

  it("恢复选区时也应把原生焦点放回编辑器", () => {
    const editor = createFormattedEditor();
    const editorElement = document.createElement("div");
    editorElement.setAttribute("contenteditable", "true");
    document.body.appendChild(editorElement);
    vi.spyOn(ReactEditor, "toDOMNode").mockReturnValue(editorElement);

    restoreSelectionAndFocus(editor, editor.selection);

    expect(document.activeElement).toBe(editorElement);
  });

  it("失焦后点击工具应恢复选区并生效", () => {
    const editor = createFormattedEditor();
    const editorRef = createEditorRef(editor);
    let latestController: MobileEditorToolbarController | null = null;

    act(() => {
      root.render(
        <ControllerProbe
          editorRef={editorRef}
          onController={controller => {
            latestController = controller;
          }}
        />
      );
    });

    expect(latestController).toBeTruthy();
    if (!latestController) return;

    act(() => {
      latestController?.syncSelection();
    });

    editor.selection = null;

    act(() => {
      latestController?.executeAction("bold");
    });

    expect(ReactEditor.focus).toHaveBeenCalled();
    expect(editor.selection).toBeTruthy();
    const marks = Editor.marks(editor) as Record<string, unknown> | null;
    expect(marks?.bold).toBe(true);
  });

  it("应支持编辑器聚焦状态和依赖选区禁用态判断", () => {
    const editor = createFormattedEditor("依赖选区", {
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [0, 0], offset: 1 },
    });
    const editorRef = createEditorRef(editor);
    let latestController: MobileEditorToolbarController | null = null;

    act(() => {
      root.render(
        <ControllerProbe
          editorRef={editorRef}
          onController={controller => {
            latestController = controller;
          }}
        />
      );
    });

    const controller = requireController(latestController);
    expect(controller.isEditorFocused).toBe(false);

    act(() => {
      controller.handleEditorFocus();
    });
    expect(requireController(latestController).isEditorFocused).toBe(true);
    expect(requireController(latestController).isActionDisabled("color")).toBe(true);
    expect(requireController(latestController).isActionDisabled("kbd")).toBe(true);
    expect(requireController(latestController).isActionDisabled("link")).toBe(false);

    editor.selection = {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 3 },
    };
    act(() => {
      controller.syncSelection();
    });
    expect(requireController(latestController).isActionDisabled("color")).toBe(false);

    act(() => {
      controller.handleEditorBlur();
    });
    expect(requireController(latestController).isEditorFocused).toBe(false);
  });

  it("editingContext 随选区刷新，collapseSelectionToFocus 折叠到焦点端", () => {
    const editor = createFormattedEditor();
    const getController = renderController(editor);

    act(() => {
      getController().syncSelection();
    });
    expect(getController().editingContext.kind).toBe("selection");

    act(() => {
      getController().collapseSelectionToFocus();
    });
    expect(editor.selection).toEqual({
      anchor: { path: [0, 0], offset: 5 },
      focus: { path: [0, 0], offset: 5 },
    });
    expect(getController().editingContext.kind).toBe("text");
  });

  it("缩进按最内层列表项类型选命令，在列表项开头执行后回到原选区", () => {
    const caret = {
      anchor: { path: [0, 1, 0, 0], offset: 2 },
      focus: { path: [0, 1, 0, 0], offset: 2 },
    };
    const editor = createListEditor("bulleted-list", caret);
    const selectionsAtExecute: BaseSelection[] = [];
    const execute = vi.fn<(id: string) => boolean>(() => {
      selectionsAtExecute.push(editor.selection);
      return true;
    });
    editor.commands = { execute };
    const getController = renderController(editor);

    act(() => {
      getController().indent();
    });
    expect(execute).toHaveBeenCalledWith("tau.list-item.indent");
    expect(selectionsAtExecute[0]).toEqual({
      anchor: { path: [0, 1, 0, 0], offset: 0 },
      focus: { path: [0, 1, 0, 0], offset: 0 },
    });
    expect(editor.selection).toEqual(caret);
    expect(getController().canIndent).toBe(true);

    const checkEditor = createListEditor("check-list", caret);
    const checkExecute = vi.fn<(id: string) => boolean>(() => true);
    checkEditor.commands = { execute: checkExecute };
    const getCheckController = renderController(checkEditor);
    act(() => {
      getCheckController().outdent();
    });
    expect(checkExecute).toHaveBeenCalledWith("tau.check-list.outdent");
  });

  it("光标不在列表项内时缩进不执行命令", () => {
    const editor = createFormattedEditor();
    const execute = vi.fn<(id: string) => boolean>(() => true);
    editor.commands = { execute };
    const getController = renderController(editor);

    act(() => {
      getController().indent();
    });
    expect(execute).not.toHaveBeenCalled();
  });
  it("getCurrentBlockKind 取最内层相关块类型，面板打开时按面板选区", () => {
    const paragraph = (text: string) => ({
      type: "paragraph",
      children: [{ type: "formatted", text }],
    });
    const list = (listType: string, itemType: string, text: string) => ({
      type: listType,
      children: [{ type: itemType, children: [paragraph(text)] }],
    });
    const editor = createEditor();
    editor.children = [
      paragraph("正文"),
      { type: "header", level: 1, children: [{ type: "formatted", text: "一" }] },
      { type: "header", level: 3, children: [{ type: "formatted", text: "三" }] },
      list("bulleted-list", "list-item", "无序"),
      list("numbered-list", "list-item", "编号"),
      list("check-list", "check-list-item", "待办"),
      { type: "blockquote", children: [paragraph("引用")] },
      { type: "blockquote", children: [list("numbered-list", "list-item", "引用内列表")] },
      { type: "header", level: 4, children: [{ type: "formatted", text: "四" }] },
      { type: "code-block", children: [{ type: "formatted", text: "code" }] },
    ] as unknown as Descendant[];
    const caretAt = (path: number[]): BaseSelection => ({
      anchor: { path, offset: 0 },
      focus: { path, offset: 0 },
    });
    editor.selection = caretAt([0, 0]);
    const getController = renderController(editor);

    const cases: Array<[number[], string]> = [
      [[0, 0], "paragraph"],
      [[1, 0], "h1"],
      [[2, 0], "h3"],
      [[3, 0, 0, 0], "bulleted-list"],
      [[4, 0, 0, 0], "numbered-list"],
      [[5, 0, 0, 0], "check-list"],
      [[6, 0, 0], "quote"],
      [[7, 0, 0, 0, 0], "numbered-list"],
      [[8, 0], "other"],
      [[9, 0], "other"],
    ];
    for (const [path, kind] of cases) {
      editor.selection = caretAt(path);
      act(() => {
        getController().syncSelection();
      });
      expect(getController().getCurrentBlockKind(), path.join(".")).toBe(kind);
    }

    editor.selection = caretAt([1, 0]);
    act(() => {
      getController().openPanel("style", 280);
    });
    // 面板打开期间编辑器选区被清空，仍按面板选区判断
    editor.selection = null;
    act(() => {
      getController().handleEditorBlur();
    });
    expect(getController().getCurrentBlockKind()).toBe("h1");
  });

  it("getCurrentMarks 含刚应用到选区与光标处的样式，无选区为 null", () => {
    const editor = createFormattedEditor("hello", {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 5 },
    });
    const getController = renderController(editor);
    act(() => {
      getController().applyHighlightMark("green");
    });
    expect(getController().getCurrentMarks()).toMatchObject({ highlight: "green" });
    // 光标处应用的待输入样式同样计入
    act(() => {
      getController().applyColorMark("#e33a32", "#fa7873");
    });
    expect(getController().getCurrentMarks()).toMatchObject({
      highlight: "green",
      color: "#e33a32",
    });
    editor.selection = null;
    act(() => {
      getController().syncSelection();
    });
    expect(getController().getCurrentMarks()).toBeNull();
  });
});
