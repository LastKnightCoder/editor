import { Editor, Element as SlateElement, Path, Point, Range, Transforms } from "slate";
import type { Plugin } from "@tau/editor/api";

/**
 * 表格的删除防护（受信任层 plugin，ER-005）：delete / deleteFragment 不在
 * ElementBehaviors 的方法面上——它们是编辑器级方法而非元素行为，声明式 API
 * 表达不了，保留为原始 Slate 插件。cell 内的退格/回车已转 table-cell 的声明式行为。
 */
export const withTableDeleteGuard: Plugin = editor => {
  const { delete: editorDelete, deleteFragment } = editor;

  const isWholeDocumentSelection = (selection: NonNullable<Editor["selection"]>) => {
    const [selectionStart, selectionEnd] = Range.edges(selection);
    return (
      Point.equals(selectionStart, Editor.start(editor, [])) &&
      Point.equals(selectionEnd, Editor.end(editor, []))
    );
  };

  const resetToEmptyParagraph = () => {
    Editor.withoutNormalizing(editor, () => {
      while (editor.children.length > 0) {
        Transforms.removeNodes(editor, {
          at: [editor.children.length - 1],
        });
      }

      Transforms.insertNodes(editor, {
        type: "paragraph",
        children: [{ type: "formatted", text: "" }],
      });
      Transforms.select(editor, Editor.start(editor, []));
    });
  };

  // 同一表格内跨单元格的选区删除：不执行（防止一次删除吃掉整个单元格结构）
  editor.delete = unit => {
    const { selection } = editor;
    const shouldResetAfterDelete =
      !!selection && Range.isExpanded(selection) && isWholeDocumentSelection(selection);

    if (selection) {
      const anchorCell = Editor.above(editor, {
        at: selection.anchor,
        match: n => SlateElement.isElement(n) && n.type === "table-cell",
      });
      const focusCell = Editor.above(editor, {
        at: selection.focus,
        match: n => SlateElement.isElement(n) && n.type === "table-cell",
      });

      if (anchorCell && focusCell) {
        const [, anchorCellPath] = anchorCell;
        const [, focusCellPath] = focusCell;
        const anchorTable = Editor.above(editor, {
          at: selection.anchor,
          match: n => SlateElement.isElement(n) && n.type === "table",
        });
        const focusTable = Editor.above(editor, {
          at: selection.focus,
          match: n => SlateElement.isElement(n) && n.type === "table",
        });

        if (
          anchorTable &&
          focusTable &&
          Path.equals(anchorTable[1], focusTable[1]) &&
          !Path.equals(anchorCellPath, focusCellPath)
        ) {
          return;
        }
      }
    }

    editorDelete(unit);

    if (shouldResetAfterDelete) {
      resetToEmptyParagraph();
    }
  };

  // 全选后删除：表格结构全删后补一个空段落，光标有落点
  editor.deleteFragment = options => {
    const { selection } = editor;
    const shouldResetAfterDelete =
      !!selection && Range.isExpanded(selection) && isWholeDocumentSelection(selection);

    deleteFragment(options);

    if (shouldResetAfterDelete) {
      resetToEmptyParagraph();
    }
  };

  return editor;
};
