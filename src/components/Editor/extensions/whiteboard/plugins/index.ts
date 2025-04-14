import { Editor } from "slate";
import { deleteWhiteBoardContent } from "@/commands/white-board";

export const withSetting = (editor: Editor) => {
  const { apply } = editor;

  editor.apply = (op) => {
    // @ts-ignore
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
