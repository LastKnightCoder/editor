import { Editor } from "slate";
import { deleteWhiteBoardContent } from "@/commands/white-board";

export const withSetting = (editor: Editor) => {
  const { isVoid, isInline, apply } = editor;

  editor.isVoid = (element: any) => {
    return element.type === "whiteboard" ? true : isVoid(element);
  };

  editor.isInline = (element: any) => {
    return element.type === "whiteboard" ? false : isInline(element);
  };

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
