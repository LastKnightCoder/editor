import type { PluginCreatedFlashcard } from "@tau/plugins";
import type { Flashcard } from "@/types";

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
    references: card.references.map(reference => ({
      refType: reference.refType,
      title: reference.title,
      ...(reference.refType === "content"
        ? { contentId: reference.contentId }
        : { customContent: reference.content?.content }),
    })),
  };
}
