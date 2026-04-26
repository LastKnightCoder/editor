import type { HeaderElement } from "../../../types";
import {
  Editor,
  Element as SlateElement,
  NodeEntry,
  Range,
  Transforms,
} from "slate";
import {
  focusPreviousBlock,
  hasBlockNavigation,
  isInlineElementEmpty,
} from "../../../utils";

// 删除标题时，将标题转换为 paragraph，而不是移到上一个块中
export const deleteBackward = (editor: Editor) => {
  const { deleteBackward } = editor;

  editor.deleteBackward = (unit) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const currentBlock = Editor.above(editor, {
        match: (n) => SlateElement.isElement(n) && editor.isBlock(n),
      });
      if (currentBlock) {
        const [block, blockPath] = currentBlock as NodeEntry<SlateElement>;
        if (
          block.type === "paragraph" &&
          Editor.isStart(editor, selection.anchor, blockPath)
        ) {
          const prevBlock = Editor.previous(editor, {
            at: blockPath,
            match: (n) => SlateElement.isElement(n) && editor.isBlock(n),
          });
          if (prevBlock) {
            const [prevNode, prevPath] = prevBlock as NodeEntry<HeaderElement>;
            if (prevNode.type === "header" && prevNode.collapsed) {
              Transforms.select(editor, Editor.end(editor, prevPath));
              return;
            }
          }
        }
      }

      const [match] = Editor.nodes(editor, {
        match: (n) => SlateElement.isElement(n) && n.type === "header",
      });
      if (match) {
        const [node, path] = match as NodeEntry<HeaderElement>;
        const isStart = Editor.isStart(editor, selection.anchor, path);
        if (isStart) {
          const isEmpty = node.children.every((child) =>
            isInlineElementEmpty(child),
          );
          if (!isEmpty) {
            const prevBlock = Editor.previous(editor, {
              at: path,
              match: (n) => SlateElement.isElement(n) && editor.isBlock(n),
            });
            if (prevBlock) {
              const [prevNode, prevPath] = prevBlock as NodeEntry<SlateElement>;
              if (!editor.isVoid(prevNode) && !hasBlockNavigation(prevNode)) {
                Transforms.select(editor, Editor.end(editor, prevPath));
                return;
              }

              focusPreviousBlock(editor, path, {
                reason: "delete",
                direction: "backward",
              });
            }
            return;
          }

          // 空标题退化为普通段落，并移除标题专属属性
          Transforms.setNodes(editor, {
            type: "paragraph",
          });
          Transforms.unsetNodes(editor, "level");
          Transforms.unsetNodes(editor, "collapsed");
          return;
        }
      }
    }
    deleteBackward(unit);
  };

  return editor;
};
