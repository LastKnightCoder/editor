import { Editor } from "slate";
import { createQuestion } from "@/commands/question";
import { getDefaultQuestionGroup } from "@/commands/question-group";
import { setOrInsertNode } from "@/components/Editor/utils";

export const createQuestionNode = async (editor: Editor) => {
  try {
    // 获取默认分组并创建一个新的问题
    const defaultGroup = await getDefaultQuestionGroup();
    const question = await createQuestion("新问题", defaultGroup.id);
    const questionId = question.id;

    setOrInsertNode(editor, {
      // @ts-ignore
      type: "question",
      questionId,
      title: "新问题",
      children: [{ type: "formatted", text: "" }],
    });
  } catch (error) {
    console.error("创建问题节点失败:", error);
  }
};
