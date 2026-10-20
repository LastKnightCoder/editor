import type { FlashcardsAdapter } from "@tau/plugins/host";
import {
  assertFlashcardScope,
  generateFlashcardDrafts,
  openFlashcardCreation,
  scopedFlashcardCommands,
} from "@/services/flashcard-creation";
import { assertFlashcardDraft } from "@/features/flashcards/validateDraft";
import type { PluginFlashcardDraft } from "@tau/plugins";
import { toPluginFlashcard } from "@/services/flashcard-results";
import { invalidateFlashcardViews } from "@/features/flashcards/queries";
import { queryClient } from "@/queryClient";

export function createDesktopFlashcards(databaseName: string): FlashcardsAdapter {
  const refresh = () => invalidateFlashcardViews(queryClient, databaseName);
  const scope = (context: { signal: AbortSignal }) => ({ databaseName, signal: context.signal });
  const validateDraft = (input: PluginFlashcardDraft & { deckId: number }) => {
    if (!Number.isSafeInteger(input.deckId) || input.deckId <= 0) throw new Error("卡组 ID 无效");
    assertFlashcardDraft(input);
  };
  return {
    async listDecks(context) {
      const current = scope(context);
      assertFlashcardScope(current);
      return scopedFlashcardCommands(current).listFlashcardDecks();
    },
    async createDeck(context, input) {
      const current = scope(context);
      assertFlashcardScope(current);
      if (typeof input.name !== "string" || !input.name.trim()) throw new Error("卡组名称不能为空");
      const deck = await scopedFlashcardCommands(current).createFlashcardDeck({
        ...input,
        name: input.name.trim(),
      });
      await refresh();
      return deck;
    },
    async createCard(context, input) {
      const current = scope(context);
      assertFlashcardScope(current);
      validateDraft(input);
      const api = scopedFlashcardCommands(current);
      if (!(await api.getFlashcardDeck(input.deckId))) throw new Error("卡组不存在");
      assertFlashcardScope(current);
      const card = await api.createFlashcard(input);
      await refresh();
      return toPluginFlashcard(card);
    },
    openCreate: (context, options) => openFlashcardCreation(options, scope(context)),
    generate: (context, options) => generateFlashcardDrafts(options, scope(context)),
    async generateAndSave(context, options) {
      const current = scope(context);
      const api = scopedFlashcardCommands(current);
      assertFlashcardScope(current);
      if (!(await api.getFlashcardDeck(options.deckId))) throw new Error("卡组不存在");
      const drafts = await generateFlashcardDrafts(options, current);
      const inputs = drafts.map(draft => ({ ...draft, deckId: options.deckId }));
      inputs.forEach(validateDraft);
      const cards = [];
      const failed = [];
      try {
        for (const [index, input] of inputs.entries()) {
          assertFlashcardScope(current);
          try {
            cards.push(await api.createFlashcard(input));
          } catch (error) {
            assertFlashcardScope(current);
            failed.push({
              index,
              message: error instanceof Error ? error.message : "保存闪卡失败",
            });
          }
        }
      } finally {
        if (cards.length) await refresh();
      }
      return { cards: cards.map(toPluginFlashcard), failed };
    },
  };
}
