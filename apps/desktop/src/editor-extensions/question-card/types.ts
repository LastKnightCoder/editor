import type { Descendant } from "slate";

export interface QuestionElement {
  type: "question";
  questionId: number;
  title: string;
  children: Descendant[];
}
