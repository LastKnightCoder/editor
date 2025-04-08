import { Editor } from "slate";
import { createQuestion } from "@/commands/question";
import { setOrInsertNode } from "@/components/Editor/utils";

export const createQuestionNode = async (editor: Editor) => {
  try {
    // 创建一个新的问题
    const question = await createQuestion("新问题");
    console.log("question", question);
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
