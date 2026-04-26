import {
  Editor,
  Element as SlateElement,
  Path,
  Point,
  Range,
  Transforms,
} from "slate";
import {
  isAtParagraphStart,
  isParagraphAndEmpty,
  isParagraphElement,
  movePrevCol,
} from "../../../utils";

export const deleteBackward = (editor: Editor) => {
  const { deleteBackward, delete: editorDelete, deleteFragment } = editor;

  const isWholeDocumentSelection = (
    selection: NonNullable<Editor["selection"]>,
  ) => {
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

  editor.deleteBackward = (unit) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [cell] = Editor.nodes(editor, {
        match: (n) => n.type === "table-cell",
      });
      if (cell) {
        const [text] = Editor.nodes(editor, {
          match: (n) => n.type === "formatted",
        });
        if (text) {
          const [, path] = text;
          if (
            path[path.length - 1] === 0 &&
            Editor.isStart(editor, selection.anchor, path)
          ) {
            movePrevCol(editor);
            return;
          }
        }
      }
      if (isAtParagraphStart(editor)) {
        const [match] = Editor.nodes(editor, {
          match: (n) => SlateElement.isElement(n) && isParagraphElement(n),
        });
        const [, path] = match;
        const prevPath = Editor.before(editor, path);
        if (prevPath) {
          const [prevMatch] = Editor.nodes(editor, {
            at: prevPath,
            match: (n) => SlateElement.isElement(n) && n.type === "table",
          });
          if (prevMatch) {
            if (isParagraphAndEmpty(editor)) {
              Transforms.removeNodes(editor, { at: path });
            }
            Transforms.move(editor, { distance: -1, unit: "line" });
            return;
          }
        }
      }
    }

    deleteBackward(unit);
  };

  editor.delete = (unit) => {
    const { selection } = editor;
    const shouldResetAfterDelete =
      !!selection &&
      Range.isExpanded(selection) &&
      isWholeDocumentSelection(selection);

    if (selection) {
      const anchorCell = Editor.above(editor, {
        at: selection.anchor,
        match: (n) => SlateElement.isElement(n) && n.type === "table-cell",
      });
      const focusCell = Editor.above(editor, {
        at: selection.focus,
        match: (n) => SlateElement.isElement(n) && n.type === "table-cell",
      });

      if (anchorCell && focusCell) {
        const [, anchorCellPath] = anchorCell;
        const [, focusCellPath] = focusCell;
        const anchorTable = Editor.above(editor, {
          at: selection.anchor,
          match: (n) => SlateElement.isElement(n) && n.type === "table",
        });
        const focusTable = Editor.above(editor, {
          at: selection.focus,
          match: (n) => SlateElement.isElement(n) && n.type === "table",
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

  editor.deleteFragment = (options) => {
    const { selection } = editor;
    const shouldResetAfterDelete =
      !!selection &&
      Range.isExpanded(selection) &&
      isWholeDocumentSelection(selection);

    deleteFragment(options);

    if (shouldResetAfterDelete) {
      resetToEmptyParagraph();
    }
  };

  return editor;
};
