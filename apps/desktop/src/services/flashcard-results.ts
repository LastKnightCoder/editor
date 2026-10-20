import type { PluginCreatedFlashcard } from "@tau/plugins";
import type { Flashcard } from "@/types";
import { encodeContentRef } from "@/utils/plugin-content-ref";

export function toPluginFlashcard(card: Flashcard): PluginCreatedFlashcard {
  return {
    id: card.id,
    deckId: card.deckId,
    type: card.type,
    prompt: card.prompt,
    detail: card.detail,
    data: card.data,
    tags: card.tags,
    difficulty: card.difficulty,
    references: card.references.flatMap<NonNullable<PluginCreatedFlashcard["references"]>[number]>(
      reference => {
        if (!reference.content) return [];
        return [
          reference.refType === "content"
            ? {
                refType: "content" as const,
                title: reference.title,
                contentRef: encodeContentRef(reference.contentId, reference.content.createTime),
              }
            : {
                refType: "custom" as const,
                title: reference.title,
                customContent: reference.content.content,
              },
        ];
      }
    ),
  };
}
