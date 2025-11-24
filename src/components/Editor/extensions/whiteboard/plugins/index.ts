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
      !editor.isResetValue
    ) {
      // 如果是新建白板或引用已有白板，则不恢复引用数
      // 因为新建时 createWhiteBoardContent 已设置 ref_count = 1
      // 引用时 incrementWhiteBoardContentRefCount 已手动增加
      // @ts-ignore
      if (editor.isInsertNewWhiteboard) {
        // @ts-ignore
        editor.isInsertNewWhiteboard = false;
      } else {
        // 撤回删除：需要恢复引用计数
        // @ts-ignore
        incrementWhiteBoardContentRefCount(op.node.whiteBoardContentId);
      }
    }

    if (
      op.type === "remove_node" &&
      op.node.type === "whiteboard" &&
      !editor.isResetValue
    ) {
      // 删除白板：减少引用计数
      // @ts-ignore
      deleteWhiteBoardContent(op.node.whiteBoardContentId);
    }

    apply(op);
  };

  return editor;
};
