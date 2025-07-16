import { Editor, Node } from "slate";
import { deleteQuestion } from "@/commands/question";
import { QuestionElement } from "..";

export const isQuestionElement = (
  element: Node,
  // @ts-ignore
): element is QuestionElement => {
  // @ts-ignore
  return element.type === "question";
};

export const withQuestion = (editor: Editor) => {
  const { isVoid, apply, isBlock } = editor;

  // 标记为 void 元素，不可编辑
  editor.isVoid = (element) => {
    // @ts-ignore
    return element.type === "question" || isVoid(element);
  };

  editor.isBlock = (element) => {
    // @ts-ignore
    return element.type === "question" || isBlock(element);
  };

  // 删除问题节点的时候，删除问题卡片
  editor.apply = (op) => {
    if (
      op.type === "remove_node" &&
      isQuestionElement(op.node) &&
      !editor.isResetValue
    ) {
      // @ts-ignore
      deleteQuestion(op.node.questionId);
    }

    apply(op);
  };

  return editor;
};
