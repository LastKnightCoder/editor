import { Editor, Element, Node } from "slate";
import {
  deleteWhiteBoardContent,
  incrementWhiteBoardContentRefCount,
} from "@/commands/white-board";
import type { WhiteboardElement } from "../types";

type WhiteboardEditor = Editor & {
  isInsertNewWhiteboard?: boolean;
  isResetValue?: boolean;
};

const isWhiteboardElement = (node: Node): node is WhiteboardElement =>
  Element.isElement(node) && node.type === "whiteboard";

export const withSetting = (editor: Editor) => {
  const whiteboardEditor = editor as WhiteboardEditor;
  const { apply } = editor;

  editor.apply = (op) => {
    if (
      op.type === "insert_node" &&
      isWhiteboardElement(op.node) &&
      !whiteboardEditor.isResetValue
    ) {
      // 如果是新建白板或引用已有白板，则不恢复引用数
      // 因为新建时 createWhiteBoardContent 已设置 ref_count = 1
      // 引用时 incrementWhiteBoardContentRefCount 已手动增加
      if (whiteboardEditor.isInsertNewWhiteboard) {
        whiteboardEditor.isInsertNewWhiteboard = false;
      } else {
        // 撤回删除：需要恢复引用计数
        void incrementWhiteBoardContentRefCount(op.node.whiteBoardContentId);
      }
    }

    if (
      op.type === "remove_node" &&
      isWhiteboardElement(op.node) &&
      !whiteboardEditor.isResetValue
    ) {
      // 删除白板：减少引用计数
      void deleteWhiteBoardContent(op.node.whiteBoardContentId);
    }

    apply(op);
  };

  return editor;
};
