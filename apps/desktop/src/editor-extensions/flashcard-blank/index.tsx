import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor";
import type { FlashcardBlankElement } from "./types";
import FlashcardBlank from "./components/FlashcardBlank";
export type { FlashcardBlankElement } from "./types";

const flashcardBlankExtension = defineExtension({
  id: "host.flashcard-blank",
  elements: [
    // flashcard-blank 不是 void 元素，可以包含文本（不设 isVoid）
    defineElement<FlashcardBlankElement>({
      type: "flashcard-blank",
      dataVersion: 1,
      kind: "inline",
      render: ({ attributes, element, children }: ElementRenderProps<FlashcardBlankElement>) => (
        <FlashcardBlank attributes={attributes} element={element}>
          {children}
        </FlashcardBlank>
      ),
    }),
  ],
});

export default flashcardBlankExtension;
