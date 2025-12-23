import { TabType } from "@/types/tab";
import { getAllQuestions, getNoAnswerQuestions } from "@/commands/question";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class QuestionsProvider extends BaseTabContentProvider<TabType.Questions> {
  readonly tabType = TabType.Questions;

  async getContent(
    tab: ITab<TabType.Questions>,
    _options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    const [allQuestions, noAnswerQuestions] = await Promise.all([
      getAllQuestions(),
      getNoAnswerQuestions(),
    ]);

    const content = {
      questions: allQuestions.slice(0, 50).map((q) => ({
        id: q.id,
        question: q.questionContent,
        groupId: q.groupId,
        answerCount: q.answers.length,
        status: q.status,
        createTime: q.createTime,
      })),
      statistics: {
        totalQuestions: allQuestions.length,
        answeredQuestions: allQuestions.length - noAnswerQuestions.length,
        unansweredQuestions: noAnswerQuestions.length,
      },
      type: "functional-page",
    };

    return {
      metadata,
      content,
      contentType: "object",
      truncated: false,
      originalLength: 0,
      totalLength: 0,
    };
  }
}
