import type {
  PluginFlashcardCreateOptions,
  PluginFlashcardCreateResult,
  PluginAICapabilityClient,
} from "@tau/plugins";
import type { CommandScope } from "./command-context";
import { bindDatabaseCommands } from "./command-context";
import * as commands from "@/commands/flashcard";
import useSettingStore from "@/stores/useSettingStore";
import { importFromMarkdown } from "@/utils/markdown";
import { FLASHCARD_GENERATION_PROMPT, FLASHCARD_GENERATION_USER_PROMPT } from "@/constants/prompts";
import { getMarkdown } from "@/utils/markdown";
import { parseFlashcardResponse } from "@/features/flashcards/generation/parse";
import { toPluginFlashcard } from "./flashcard-results";
import type { CreateFlashcardInput, Flashcard, FlashcardReferenceInput } from "@/types";
import type { Descendant } from "slate";

export type FlashcardDraft = Omit<CreateFlashcardInput, "deckId">;
export type FlashcardCreationOptions = Omit<PluginFlashcardCreateOptions, "references"> & {
  references?: FlashcardReferenceInput[];
};
export type FlashcardGenerator = (
  content: Descendant[],
  signal: AbortSignal
) => Promise<FlashcardDraft[]>;

export function assertFlashcardScope(scope: CommandScope) {
  scope.signal?.throwIfAborted();
  if (
    scope.databaseName?.replace(/\.db$/, "") !==
    useSettingStore.getState().setting.database.active.replace(/\.db$/, "")
  ) {
    throw new Error("数据库已切换，请重新发起制卡");
  }
}

export function normalizeFlashcardOptions(options: FlashcardCreationOptions) {
  const content =
    typeof options.content === "string"
      ? importFromMarkdown(options.content)
      : structuredClone(options.content ?? []);
  const references = structuredClone(
    options.references ??
      (content.length
        ? [
            {
              refType: "custom" as const,
              title: options.title?.trim() || "制卡参考资料",
              customContent: content,
            },
          ]
        : [])
  );
  if (
    options.deckId !== undefined &&
    (!Number.isSafeInteger(options.deckId) || options.deckId <= 0)
  ) {
    throw new Error("卡组 ID 无效");
  }
  if (options.mode !== undefined && options.mode !== "manual" && options.mode !== "ai")
    throw new Error("制卡模式无效");
  return { ...structuredClone(options), content, references };
}

export interface FlashcardCreationRequest {
  id: number;
  options: ReturnType<typeof normalizeFlashcardOptions>;
  scope: CommandScope;
  generate?: FlashcardGenerator;
  settle(result: Omit<PluginFlashcardCreateResult, "cards"> & { cards: Flashcard[] }): void;
}
let request: FlashcardCreationRequest | null = null;
let nextId = 0;
const listeners = new Set<() => void>();
export const flashcardCreationRequests = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => request,
};
const publish = () => {
  for (const listener of listeners) listener();
};

export async function openFlashcardCreation(
  options: FlashcardCreationOptions = {},
  scope: CommandScope = {
    databaseName: useSettingStore.getState().setting.database.active,
  },
  generate?: FlashcardGenerator
): Promise<PluginFlashcardCreateResult> {
  assertFlashcardScope(scope);
  const normalized = normalizeFlashcardOptions(options);
  if (normalized.mode === "ai" && !getMarkdown(normalized.content).trim())
    throw new Error("AI 制卡内容不能为空");
  if (request) throw new Error("请先完成或关闭当前制卡窗口");
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const clear = () => {
      scope.signal?.removeEventListener("abort", abort);
      unsubscribe();
      if (request?.id === id) {
        request = null;
        publish();
      }
    };
    const abort = () => {
      clear();
      reject(scope.signal?.reason ?? new Error("制卡已取消"));
    };
    const unsubscribe = useSettingStore.subscribe(() => {
      try {
        assertFlashcardScope(scope);
      } catch {
        abort();
      }
    });
    request = {
      id,
      options: normalized,
      scope,
      generate,
      settle(result) {
        clear();
        resolve({ ...result, cards: result.cards.map(toPluginFlashcard) });
      },
    };
    scope.signal?.addEventListener("abort", abort, { once: true });
    publish();
  });
}

export async function generateFlashcardDrafts(
  options: FlashcardCreationOptions,
  scope: CommandScope,
  ai: PluginAICapabilityClient
): Promise<FlashcardDraft[]> {
  assertFlashcardScope(scope);
  const normalized = normalizeFlashcardOptions(options);
  const markdown = getMarkdown(normalized.content);
  if (!markdown.trim()) throw new Error("AI 制卡内容不能为空");
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, ...(scope.signal ? [scope.signal] : [])]);
  const cancel = () => controller.abort(new Error("闪卡生成已取消"));
  const unsubscribe = useSettingStore.subscribe(() => {
    try {
      assertFlashcardScope(scope);
    } catch {
      cancel();
    }
  });
  try {
    const result = await ai.chat({
      signal,
      messages: [
        { role: "system", content: FLASHCARD_GENERATION_PROMPT },
        { role: "user", content: FLASHCARD_GENERATION_USER_PROMPT(markdown) },
      ],
    });
    signal.throwIfAborted();
    assertFlashcardScope(scope);
    const cards = parseFlashcardResponse(result.text);
    if (!cards.length) throw new Error("模型未生成闪卡");
    return cards.map(({ type, prompt, detail, difficulty, tags, data }) => ({
      type,
      prompt,
      detail,
      difficulty,
      tags,
      data,
      references: normalized.references,
    }));
  } finally {
    unsubscribe();
  }
}

export const scopedFlashcardCommands = (scope: CommandScope) =>
  bindDatabaseCommands(commands, scope);
