import type { Descendant } from "slate";
import type { PluginContentRef } from "./data";

export type PluginFlashcardType = "single-choice" | "multiple-choice" | "cloze" | "qa" | "boolean";
export interface PluginFlashcardData {
  options?: { id: string; label: string; isCorrect: boolean; explanation?: string }[];
  blanks?: { id: string; placeholder: string; answer: string; alternativeAnswers?: string[] }[];
  answer?: string;
  booleanAnswer?: boolean;
  explanation?: string;
  hint?: string;
  referenceNotes?: string;
}
export type PluginFlashcardReference =
  | { refType: "content"; contentRef: PluginContentRef; title: string }
  | { refType: "custom"; customContent: Descendant[]; title: string };
export interface PluginFlashcardDraft {
  type: PluginFlashcardType;
  prompt: Descendant[];
  detail?: Descendant[];
  data: PluginFlashcardData;
  tags?: string[];
  difficulty?: "foundation" | "standard" | "advanced";
  references?: PluginFlashcardReference[];
}
export interface PluginFlashcardDeckInput {
  name: string;
  description?: string;
  emoji?: string;
}
export interface PluginFlashcardDeck extends PluginFlashcardDeckInput {
  id: number;
}
export interface PluginCreatedFlashcard extends PluginFlashcardDraft {
  id: number;
  deckId: number;
}
export interface PluginFlashcardCreateOptions {
  mode?: "manual" | "ai";
  /** 字符串按 Markdown 导入；富文本按当前编辑器节点协议传入。 */
  content?: string | Descendant[];
  title?: string;
  deckId?: number;
  references?: PluginFlashcardReference[];
}
export interface PluginFlashcardCreateResult {
  status: "completed" | "cancelled";
  /** 包含关闭前已保存的闪卡，取消不会撤销已完成的保存。 */
  cards: PluginCreatedFlashcard[];
}
export interface PluginFlashcardBatchResult {
  cards: PluginCreatedFlashcard[];
  failed: { index: number; message: string }[];
}
export interface PluginFlashcards {
  listDecks(): Promise<PluginFlashcardDeck[]>;
  createDeck(input: PluginFlashcardDeckInput): Promise<PluginFlashcardDeck>;
  createCard(input: PluginFlashcardDraft & { deckId: number }): Promise<PluginCreatedFlashcard>;
  /** 打开宿主窗口，等待保存或取消；不应在 activate 中等待用户完成。 */
  openCreate(options?: PluginFlashcardCreateOptions): Promise<PluginFlashcardCreateResult>;
  /** 仅生成草稿；自动落库须显式调用 generateAndSave。 */
  generate(
    options: Omit<PluginFlashcardCreateOptions, "mode" | "deckId"> & {
      content: string | Descendant[];
    }
  ): Promise<PluginFlashcardDraft[]>;
  generateAndSave(
    options: Omit<PluginFlashcardCreateOptions, "mode"> & {
      content: string | Descendant[];
      deckId: number;
    }
  ): Promise<PluginFlashcardBatchResult>;
}
