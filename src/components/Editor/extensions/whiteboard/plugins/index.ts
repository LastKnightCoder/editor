import { Editor } from "slate";
import {
  deleteWhiteBoardContent,
  incrementWhiteBoardContentRefCount,
} from "@/commands/white-board";

export const withSetting = (editor: Editor) => {
  const { apply } = editor;

  editor.apply = (op) => {
    if (
      op.type === "insert_node" &&
      op.node.type === "whiteboard" &&
      // @ts-ignore
      !editor.isResetValue
    ) {
      // 如果是新建白板，则不恢复引用数
      // @ts-ignore
      if (editor.isInsertWhiteboard) {
        // @ts-ignore
        editor.isInsertWhiteboard = false;
      } else {
        // @ts-ignore
        incrementWhiteBoardContentRefCount(op.node.whiteBoardContentId);
      }
    }

    if (
      op.type === "remove_node" &&
      op.node.type === "whiteboard" &&
      // @ts-ignore
      !editor.isResetValue
    ) {
      // @ts-ignore
      deleteWhiteBoardContent(op.node.whiteBoardContentId);
    }

    apply(op);
  };

  return editor;
};
