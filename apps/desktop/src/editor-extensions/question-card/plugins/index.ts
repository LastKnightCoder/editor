import { Editor, Element, Node } from "slate";
import { deleteQuestion } from "@/commands/question";
import type { QuestionElement } from "../types";

const isQuestionElement = (node: Node): node is QuestionElement =>
  Element.isElement(node) && node.type === "question";

type QuestionEditor = Editor & {
  isResetValue?: boolean;
};

export const withQuestion = (editor: Editor) => {
  const questionEditor = editor as QuestionEditor;
  const { isVoid, apply, isBlock } = editor;

  // 标记为 void 元素，不可编辑
  editor.isVoid = (element) => {
    return element.type === "question" || isVoid(element);
  };

  editor.isBlock = (element) => {
    return element.type === "question" || isBlock(element);
  };

  // 删除问题节点的时候，删除问题卡片
  editor.apply = (op) => {
    if (
      op.type === "remove_node" &&
      isQuestionElement(op.node) &&
      !questionEditor.isResetValue
    ) {
      void deleteQuestion(op.node.questionId);
    }

    apply(op);
  };

  return editor;
};
