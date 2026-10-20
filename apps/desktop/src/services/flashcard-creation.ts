import type {
  PluginFlashcardCreateOptions,
  PluginFlashcardCreateResult,
  PluginFlashcardDraft,
} from "@tau/plugins";
import type { CommandScope } from "./command-context";
import { bindDatabaseCommands } from "./command-context";
import * as commands from "@/commands/flashcard";
import useSettingStore from "@/stores/useSettingStore";
import { importFromMarkdown } from "@/utils/markdown";
import { piStreamText } from "./piLLM";
import { Role } from "@/constants";
import { FLASHCARD_GENERATION_PROMPT, FLASHCARD_GENERATION_USER_PROMPT } from "@/constants/prompts";
import { getMarkdown } from "@/utils/markdown";
import { parseFlashcardResponse } from "@/features/flashcards/generation/parse";
import { toPluginFlashcard } from "./flashcard-results";
import type { Flashcard } from "@/types";

export function assertFlashcardScope(scope: CommandScope) {
  scope.signal?.throwIfAborted();
  if (
    scope.databaseName?.replace(/\.db$/, "") !==
    useSettingStore.getState().setting.database.active.replace(/\.db$/, "")
  ) {
    throw new Error("数据库已切换，请重新发起制卡");
  }
}

export function normalizeFlashcardOptions(options: PluginFlashcardCreateOptions) {
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
  options: PluginFlashcardCreateOptions = {},
  scope: CommandScope = {
    databaseName: useSettingStore.getState().setting.database.active,
  }
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
  options: PluginFlashcardCreateOptions,
  scope: CommandScope
): Promise<PluginFlashcardDraft[]> {
  assertFlashcardScope(scope);
  const normalized = normalizeFlashcardOptions(options);
  const markdown = getMarkdown(normalized.content);
  if (!markdown.trim()) throw new Error("AI 制卡内容不能为空");
  const setting = useSettingStore.getState().setting;
  const usage = setting.llmUsageSettings.flashcardGeneration;
  const provider = setting.llmProviders.find(item => item.id === usage?.providerId);
  const model = provider?.models.find(item => item.id === usage?.modelId);
  if (!provider || !model) throw new Error("请先在设置中配置闪卡生成的模型");
  const handle = piStreamText(
    {
      provider,
      model,
      source: { feature: "flashcardGeneration", library: scope.databaseName },
      messages: [
        { role: Role.System, content: [{ type: "text", text: FLASHCARD_GENERATION_PROMPT }] },
        {
          role: Role.User,
          content: [{ type: "text", text: FLASHCARD_GENERATION_USER_PROMPT(markdown) }],
        },
      ],
    },
    () => undefined
  );
  const cancel = () => handle.cancel();
  const unsubscribe = useSettingStore.subscribe(() => {
    try {
      assertFlashcardScope(scope);
    } catch {
      cancel();
    }
  });
  scope.signal?.addEventListener("abort", cancel, { once: true });
  try {
    const result = await handle.result;
    assertFlashcardScope(scope);
    if (!result.ok || result.aborted) throw new Error(result.error || "闪卡生成已取消");
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
    scope.signal?.removeEventListener("abort", cancel);
  }
}

export const scopedFlashcardCommands = (scope: CommandScope) =>
  bindDatabaseCommands(commands, scope);
