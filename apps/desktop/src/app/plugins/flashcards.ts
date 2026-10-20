import type { FlashcardsAdapter } from "@tau/plugins/host";
import {
  assertFlashcardScope,
  generateFlashcardDrafts,
  openFlashcardCreation,
  scopedFlashcardCommands,
} from "@/services/flashcard-creation";
import { assertFlashcardDraft } from "@/features/flashcards/validateDraft";
import {
  PluginPermissionError,
  type PluginContext,
  type PluginFlashcardReference,
} from "@tau/plugins";
import type { CreateFlashcardInput, FlashcardReferenceInput } from "@/types";
import { toPluginFlashcard } from "@/services/flashcard-results";
import { invalidateFlashcardViews } from "@/features/flashcards/queries";
import { queryClient } from "@/queryClient";
import { decodeContentRef } from "@/utils/plugin-content-ref";
import { assertPluginUserActivation } from "./user-activation";

async function resolveReferences(
  context: PluginContext,
  references: PluginFlashcardReference[] = []
): Promise<FlashcardReferenceInput[]> {
  if (!Array.isArray(references)) throw new Error("闪卡参考资料无效");
  const resolved: FlashcardReferenceInput[] = [];
  for (const reference of references) {
    if (!reference || typeof reference.title !== "string" || !reference.title.trim())
      throw new Error("闪卡参考资料无效");
    if (reference.refType === "content") {
      const identity = decodeContentRef(reference.contentRef);
      if (!identity) throw new Error("正文引用无效");
      if (!(await context.content.read(reference.contentRef, { format: "nodes" })))
        throw new Error("引用的正文不存在或已失效");
      context.signal.throwIfAborted();
      resolved.push({ refType: "content", contentId: identity.contentId, title: reference.title });
    } else if (reference.refType === "custom") {
      resolved.push({
        refType: "custom",
        customContent: reference.customContent,
        title: reference.title,
      });
    } else {
      throw new Error("闪卡参考资料无效");
    }
  }
  return resolved;
}

async function requireWrite(context: PluginContext) {
  if ((await context.permissions.query("flashcards:write")) !== "granted")
    throw new PluginPermissionError("flashcards:write", "denied");
  context.signal.throwIfAborted();
}

export function createDesktopFlashcards(databaseName: string): FlashcardsAdapter {
  const refresh = () => invalidateFlashcardViews(queryClient, databaseName);
  const scope = (context: { signal: AbortSignal }) => ({ databaseName, signal: context.signal });
  const validateDraft = (input: CreateFlashcardInput) => {
    if (!Number.isSafeInteger(input.deckId) || input.deckId <= 0) throw new Error("卡组 ID 无效");
    assertFlashcardDraft(input);
  };
  return {
    async listDecks(context) {
      const current = scope(context);
      assertFlashcardScope(current);
      return (await scopedFlashcardCommands(current).listFlashcardDecks()).map(
        ({ id, name, description, emoji }) => ({ id, name, description, emoji })
      );
    },
    async createDeck(context, input) {
      const current = scope(context);
      assertFlashcardScope(current);
      if (typeof input.name !== "string" || !input.name.trim()) throw new Error("卡组名称不能为空");
      await requireWrite(context);
      assertFlashcardScope(current);
      const deck = await scopedFlashcardCommands(current).createFlashcardDeck({
        name: input.name.trim(),
        description: input.description,
        emoji: input.emoji,
      });
      await refresh();
      return { id: deck.id, name: deck.name, description: deck.description, emoji: deck.emoji };
    },
    async createCard(context, input) {
      const current = scope(context);
      assertFlashcardScope(current);
      const resolved = { ...input, references: await resolveReferences(context, input.references) };
      validateDraft(resolved);
      const api = scopedFlashcardCommands(current);
      if (!(await api.getFlashcardDeck(input.deckId))) throw new Error("卡组不存在");
      assertFlashcardScope(current);
      await requireWrite(context);
      assertFlashcardScope(current);
      const card = await api.createFlashcard(resolved);
      await refresh();
      return toPluginFlashcard(card);
    },
    async openCreate(context, options = {}) {
      assertPluginUserActivation();
      const current = scope(context);
      assertFlashcardScope(current);
      const ai =
        options.mode === "ai"
          ? await context.ai.requestCapability("flashcardGeneration")
          : undefined;
      const resolved = {
        ...options,
        references:
          options.references === undefined
            ? undefined
            : await resolveReferences(context, options.references),
      };
      return openFlashcardCreation(
        resolved,
        current,
        ai
          ? (content, signal) =>
              generateFlashcardDrafts({ ...resolved, content }, { ...current, signal }, ai)
          : undefined
      );
    },
    async generate(context, options) {
      const references =
        options.references === undefined
          ? undefined
          : await resolveReferences(context, options.references);
      const ai = await context.ai.requestCapability("flashcardGeneration");
      const drafts = await generateFlashcardDrafts({ ...options, references }, scope(context), ai);
      return drafts.map(draft => ({
        ...draft,
        references:
          options.references ??
          draft.references?.flatMap<PluginFlashcardReference>(reference =>
            reference.refType === "custom" && reference.customContent
              ? [
                  {
                    refType: "custom",
                    title: reference.title,
                    customContent: reference.customContent,
                  },
                ]
              : []
          ),
      }));
    },
    async generateAndSave(context, options) {
      const current = scope(context);
      const api = scopedFlashcardCommands(current);
      assertFlashcardScope(current);
      if (!(await api.getFlashcardDeck(options.deckId))) throw new Error("卡组不存在");
      const drafts = await context.flashcards.generate(options);
      const inputs = drafts.map(draft => ({ ...draft, deckId: options.deckId }));
      for (const input of inputs)
        validateDraft({ ...input, references: await resolveReferences(context, input.references) });
      const cards = [];
      const failed = [];
      try {
        for (const [index, input] of inputs.entries()) {
          assertFlashcardScope(current);
          try {
            cards.push(await context.flashcards.createCard(input));
          } catch (error) {
            assertFlashcardScope(current);
            if (error instanceof PluginPermissionError) throw error;
            failed.push({
              index,
              message: error instanceof Error ? error.message : "保存闪卡失败",
            });
          }
        }
      } finally {
        if (cards.length) await refresh();
      }
      return { cards, failed };
    },
  };
}
