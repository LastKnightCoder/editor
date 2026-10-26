// 闪卡填空（flashcard-blank）行内节点的移动端编辑扩展。
// 节点结构与桌面 apps/desktop/src/editor-extensions/flashcard-blank 完全一致（数据互通）；
// 触屏适配见 FlashcardBlankInline（配置入口不依赖 hover，配置面板为 BottomSheet）。

import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor";
import type { FlashcardBlankElement } from "./flashcardBlankTransforms";
import { FlashcardBlankInline } from "./FlashcardBlankInline";

export const flashcardBlankExtension = defineExtension({
  id: "host.flashcard-blank",
  elements: [
    // flashcard-blank 不是 void 元素，可以包含文本（不设 isVoid）
    defineElement<FlashcardBlankElement>({
      type: "flashcard-blank",
      dataVersion: 1,
      kind: "inline",
      render: ({ attributes, children, element }: ElementRenderProps<FlashcardBlankElement>) => (
        <FlashcardBlankInline attributes={attributes} element={element}>
          {children}
        </FlashcardBlankInline>
      ),
    }),
  ],
});
