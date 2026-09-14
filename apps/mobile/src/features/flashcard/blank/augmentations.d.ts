// 移动端编辑器的应用侧元素类型登记（对齐桌面 editor-extensions/augmentations.d.ts 机制）：
// 把 flashcard-blank 并入共享编辑器的 CustomElement 联合，使 Slate transforms 的
// 类型收窄自然成立，避免散落的硬编码 cast。
import type {} from "@tau/editor/src/types/custom-element";
import type { FlashcardBlankElement } from "./flashcardBlankTransforms";

declare module "@tau/editor/src/types/custom-element" {
  interface ExternalElementMap {
    "flashcard-blank": FlashcardBlankElement;
  }

  interface ExternalInlineElementMap {
    "flashcard-blank": FlashcardBlankElement;
  }
}

export {};
