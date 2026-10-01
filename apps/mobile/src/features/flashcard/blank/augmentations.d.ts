// 移动端编辑器的应用侧元素类型登记（对齐桌面 editor-extensions/augmentations.d.ts 机制）：
// 把 flashcard-blank 并入共享编辑器的 CustomElement 联合，使 Slate transforms 的
// 类型收窄自然成立，避免散落的硬编码 cast。
import type {} from "@tau/editor/api";
import type { FlashcardBlankElement } from "./flashcardBlankTransforms";

declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    "flashcard-blank": FlashcardBlankElement;
  }

  interface ExtensionInlineElementMap {
    "flashcard-blank": FlashcardBlankElement;
  }
}

export {};
