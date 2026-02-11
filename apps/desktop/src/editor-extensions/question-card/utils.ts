import { Editor, Descendant } from "slate";
import { createQuestion } from "@/commands/question";
import { getDefaultQuestionGroup } from "@/commands/question-group";
import { setOrInsertNode } from "@tau/editor/src";
import type { QuestionElement } from "./types";

const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

export const createQuestionNode = async (editor: Editor) => {
  try {
    // 获取默认分组并创建一个新的问题
    const defaultGroup = await getDefaultQuestionGroup();
    const question = await createQuestion(
      "新问题",
      defaultGroup.id,
      DEFAULT_CONTENT,
    );
    const questionId = question.id;

    const questionNode: QuestionElement = {
      type: "question",
      questionId,
      title: "新问题",
      children: [{ type: "formatted", text: "" }],
    };

    setOrInsertNode(editor, questionNode);
  } catch (error) {
    console.error("创建问题节点失败:", error);
  }
};
