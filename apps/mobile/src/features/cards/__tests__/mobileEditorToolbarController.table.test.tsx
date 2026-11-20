import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor, Transforms, createEditor, type BaseSelection, type Descendant } from "slate";
import { ReactEditor } from "slate-react";
import {
  renderControllerOn,
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

  describe("编辑上下文", () => {
    function createTableDoc(selection: BaseSelection): Editor {
      const editor = createEditor();
      editor.children = [
        { type: "paragraph", children: [{ type: "formatted", text: "intro" }] },
        {
          type: "table",
          children: [0, 1, 2].map(row => ({
            type: "table-row",
            children: [0, 1].map(col => ({
              type: "table-cell",
              children: [{ type: "formatted", text: `r${row}c${col}` }],
            })),
          })),
        },
        {
          type: "code-block",
          uuid: "code-1",
          language: "ts",
          code: "",
          children: [{ type: "formatted", text: "" }],
        },
      ] as unknown as Descendant[];
      editor.selection = selection;
      return editor;
    }

    const caret = (path: number[], offset = 1): NonNullable<BaseSelection> => ({
      anchor: { path, offset },
      focus: { path, offset },
    });

    it("光标在表格给出 table 上下文；手动退回后按 text，离开该表格即恢复", () => {
      const editor = createTableDoc(caret([1, 1, 0, 0]));
      const getController = renderController(editor);
      act(() => {
        getController().syncSelection();
      });
      expect(getController().editingContext).toMatchObject({
        kind: "table",
        row: 1,
        col: 0,
        rowCount: 3,
        colCount: 2,
      });

      act(() => {
        getController().dismissEditingContext();
      });
      expect(getController().editingContext.kind).toBe("text");

      // 同一表格内换单元格仍保持退回
      act(() => {
        Transforms.select(editor, caret([1, 2, 1, 0]));
        getController().syncSelection();
      });
      expect(getController().editingContext.kind).toBe("text");

      act(() => {
        Transforms.select(editor, caret([0, 0]));
        getController().syncSelection();
      });
      expect(getController().editingContext.kind).toBe("text");

      act(() => {
        Transforms.select(editor, caret([1, 0, 0, 0]));
        getController().syncSelection();
      });
      expect(getController().editingContext.kind).toBe("table");
    });

    it("runTableAction 作用于光标所在表格并刷新上下文", () => {
      const editor = createTableDoc(caret([1, 1, 1, 0]));
      const getController = renderController(editor);
      act(() => {
        getController().runTableAction("insert-row-below");
      });
      expect(getController().editingContext).toMatchObject({ kind: "table", row: 2, rowCount: 4 });
      act(() => {
        getController().runTableAction("cycle-align");
      });
      expect(getController().getTableColumnAlign()).toBe("center");
    });

    it("表格菜单打开期间动作作用于保存的选区，关闭时恢复选区并聚焦", () => {
      const editor = createTableDoc(caret([1, 1, 0, 0]));
      const getController = renderController(editor);
      act(() => {
        getController().openTableMenu();
        vi.runAllTimers();
      });
      expect(getController().isTableMenuOpen).toBe(true);
      expect(getController().isToolbarVisible).toBe(true);

      // 菜单遮罩让编辑器失焦，Slate 选区可能丢失
      editor.selection = null;
      vi.mocked(ReactEditor.focus).mockClear();
      act(() => {
        getController().runTableAction("move-row-down");
      });
      expect(ReactEditor.focus).not.toHaveBeenCalled();
      expect(Editor.string(editor, [1, 2, 0])).toBe("r1c0");

      editor.selection = null;
      act(() => {
        getController().closeTableMenu();
      });
      expect(getController().isTableMenuOpen).toBe(false);
      expect(ReactEditor.focus).toHaveBeenCalled();
      expect((editor.selection as BaseSelection)?.anchor.path).toEqual([1, 2, 0, 0]);
    });

    it("焦点进入代码块 textarea 时 Slate 失焦仍显示配件栏，离开后一帧收起", () => {
      const editor = createTableDoc(caret([0, 0]));
      const elementDom = document.createElement("div");
      elementDom.setAttribute("data-slate-node", "element");
      elementDom.innerHTML = '<textarea class="code-block-shiki-input"></textarea>';
      document.body.appendChild(elementDom);
      vi.spyOn(ReactEditor, "toSlateNode").mockReturnValue(editor.children[2]);
      vi.spyOn(ReactEditor, "findPath").mockReturnValue([2]);
      const frames: FrameRequestCallback[] = [];
      vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
        frames.push(callback);
        return frames.length;
      });

      const getController = renderController(editor);
      act(() => {
        getController().handleEditorFocus();
      });
      const textarea = elementDom.querySelector("textarea");
      act(() => {
        textarea?.focus();
        getController().handleEditorBlur();
      });
      expect(getController().isEditorFocused).toBe(false);
      expect(getController().editingContext).toMatchObject({ kind: "code", uuid: "code-1" });
      expect(getController().isToolbarVisible).toBe(true);

      act(() => {
        textarea?.blur();
      });
      // focusout 后等一帧再判
      expect(getController().isToolbarVisible).toBe(true);
      act(() => {
        frames.splice(0).forEach(callback => callback(0));
      });
      expect(getController().editingContext.kind).toBe("text");
      expect(getController().isToolbarVisible).toBe(false);
    });
  });
});
