import { Descendant } from "slate";

export interface FlashcardBlankElement {
  type: "flashcard-blank";
  blankId: string; // 唯一标识符
  placeholder: string; // 提示文本，如 "国家名"
  answer: string; // 正确答案
  alternativeAnswers?: string[]; // 备选答案（可选）
  uuid: string; // Slate 节点标识
  children: Descendant[]; // 包裹的文本内容
}
