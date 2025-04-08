import { Editor, Node } from "slate";
import { deleteQuestion } from "@/commands/question";

export const isQuestionElement = (element: Node): boolean => {
  // @ts-ignore
  return element.type === "question";
};

export const withQuestion = (editor: Editor) => {
  const { isVoid, isInline, apply } = editor;

  // 标记为 void 元素，不可编辑
  editor.isVoid = (element) => {
    // @ts-ignore
    return element.type === "question" || isVoid(element);
  };

  // 标记为块级元素
  editor.isInline = (element) => {
    // @ts-ignore
    return element.type !== "question" && isInline(element);
  };

  // 删除问题节点的时候，删除问题卡片
  editor.apply = (op) => {
    // @ts-ignore
    if (
      op.type === "remove_node" &&
      isQuestionElement(op.node) &&
      // @ts-ignore
      !editor.isResetValue
    ) {
      // @ts-ignore
      deleteQuestion(op.node.questionId);
    }

    apply(op);
  };

  return editor;
};
