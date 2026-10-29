import { invoke } from "@tauri-apps/api/core";
import {
  PluginPermissionError,
  type PluginContext,
  type PluginCreatedFlashcard,
  type PluginFlashcardCreateOptions,
  type PluginFlashcardCreateResult,
  type PluginFlashcardDraft,
  type PluginFlashcardReference,
} from "@tau/plugins";
import { assertContentNodes } from "@tau/plugins/content-input";
import type { FlashcardsAdapter } from "@tau/plugins/host";
import type { MobileDataAdapter } from "./data";
import type { Navigator } from "../../router/navigatorTypes";
import type { Flashcard, FlashcardDeck } from "../../features/flashcard/types";
import { extractBlanks } from "../../features/flashcard/reviewFlow";
import { isEditorContentEmpty } from "../../features/cards/editorContentUtils";
import { mobileImportFromMarkdown } from "../../services/editorMarkdown";

export function validateMobileFlashcard(input: PluginFlashcardDraft & { deckId: number }) {
  if (!Number.isSafeInteger(input.deckId) || input.deckId <= 0) throw new Error("卡组编号无效");
  assertContentNodes(input.prompt);
  if (input.detail !== undefined) assertContentNodes(input.detail);
  if (isEditorContentEmpty(input.prompt)) throw new Error("请填写题干");
  if (
    input.difficulty !== undefined &&
    !["foundation", "standard", "advanced"].includes(input.difficulty)
  )
    throw new Error("闪卡难度无效");
  if (
    input.tags !== undefined &&
    (!Array.isArray(input.tags) || input.tags.some(tag => typeof tag !== "string"))
  )
    throw new Error("闪卡标签无效");
  const data = input.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("闪卡答案无效");
  for (const key of ["answer", "hint", "explanation", "referenceNotes"] as const)
    if (data[key] !== undefined && typeof data[key] !== "string") throw new Error("闪卡答案无效");
  switch (input.type) {
    case "qa":
      if (!data.answer?.trim()) throw new Error("请填写参考答案");
      break;
    case "boolean":
      if (typeof data.booleanAnswer !== "boolean") throw new Error("判断题答案无效");
      break;
    case "single-choice":
    case "multiple-choice": {
      const options = data.options;
      if (
        !Array.isArray(options) ||
        options.length < 2 ||
        options.some(
          option =>
            !option ||
            typeof option.id !== "string" ||
            !option.id.trim() ||
            typeof option.label !== "string" ||
            !option.label.trim() ||
            typeof option.isCorrect !== "boolean"
        )
      )
        throw new Error("至少提供两个有效选项");
      if (new Set(options.map(option => option.id)).size !== options.length)
        throw new Error("选项编号重复");
      const correct = options.filter(option => option.isCorrect).length;
      if (!correct || (input.type === "single-choice" && correct !== 1))
        throw new Error("正确答案数量无效");
      break;
    }
    case "cloze": {
      const blanks = extractBlanks(input.prompt);
      if (
        !blanks.length ||
        blanks.some(
          blank =>
            !blank.blankId ||
            !blank.answer.trim() ||
            blank.alternativeAnswers?.some(answer => typeof answer !== "string" || !answer.trim())
        ) ||
        new Set(blanks.map(blank => blank.blankId)).size !== blanks.length
      )
        throw new Error("请设置有效且编号不重复的填空");
      break;
    }
    default:
      throw new Error("闪卡题型无效");
  }
}

export interface MobileFlashcardRequest {
  id: number;
  options: PluginFlashcardCreateOptions;
  signal: AbortSignal;
  prepare(): Promise<import("slate").Descendant[]>;
  save(input: PluginFlashcardDraft & { deckId: number }): Promise<void>;
  createDeck(input: {
    name: string;
    description?: string;
    emoji?: string;
    coverColor?: string;
  }): Promise<{ id: number }>;
  close(): void;
  dismiss(): void;
  complete(): void;
}
let sequence = 0;

export function createMobileFlashcards(
  database: string,
  token: string,
  data: MobileDataAdapter,
  navigator: Pick<Navigator, "push">,
  changed: () => void
) {
  let disposed = false;
  let current: MobileFlashcardRequest | null = null;
  let abortPending: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(listener => listener());
  const check = (context: PluginContext) => {
    context.signal.throwIfAborted();
    if (disposed || context.workspaceId !== database) throw new Error("插件闪卡会话已失效");
  };
  const call = async <T>(
    context: PluginContext,
    method: string,
    payload: unknown = {}
  ): Promise<T> => {
    check(context);
    const result = await invoke<T>("plugin_flashcards", {
      database,
      token,
      pluginId: context.pluginId,
      method,
      payload,
    });
    check(context);
    return result;
  };
  const writePermission = async (context: PluginContext) => {
    check(context);
    if ((await context.permissions.query("flashcards:write")) !== "granted")
      throw new PluginPermissionError("flashcards:write", "denied");
    check(context);
  };
  const references = async (context: PluginContext, values: PluginFlashcardReference[] = []) => {
    if (!Array.isArray(values)) throw new Error("闪卡参考资料无效");
    const result = [];
    for (const value of values) {
      if (!value || typeof value.title !== "string" || !value.title.trim())
        throw new Error("参考资料标题不能为空");
      if (value.refType === "content") {
        const match = /^(\d+):(\d+)$/.exec(value.contentRef);
        if (
          !match ||
          !Number.isSafeInteger(Number(match[1])) ||
          !Number.isSafeInteger(Number(match[2]))
        )
          throw new Error("参考正文身份无效");
        if (!(await context.content.read(value.contentRef, { format: "nodes" })))
          throw new Error("参考正文不存在");
        check(context);
        result.push({
          refType: "content" as const,
          contentId: Number(match[1]),
          contentCreatedAt: Number(match[2]),
          title: value.title,
        });
      } else if (value.refType === "custom") {
        assertContentNodes(value.customContent);
        const prepared = await data.prepareContent(context, {
          nodes: value.customContent,
          contracts: value.contracts,
        });
        check(context);
        result.push({
          refType: "custom" as const,
          customContent: prepared.nodes,
          contracts: prepared.contracts,
          count: prepared.count,
          title: value.title,
        });
      } else throw new Error("参考资料类型无效");
    }
    return result;
  };
  const create = async (
    context: PluginContext,
    input: PluginFlashcardDraft & { deckId: number },
    manualGuard?: () => void
  ): Promise<PluginCreatedFlashcard> => {
    check(context);
    validateMobileFlashcard(input);
    const resolved = await references(context, input.references);
    if (manualGuard) manualGuard();
    else await writePermission(context);
    check(context);
    const card = await call<Flashcard>(context, "createCard", { ...input, references: resolved });
    changed();
    const savedReferences: PluginFlashcardReference[] = resolved.map(reference =>
      reference.refType === "custom"
        ? {
            refType: "custom",
            customContent: reference.customContent,
            contracts: reference.contracts,
            title: reference.title.trim(),
          }
        : {
            refType: "content",
            contentRef: `${reference.contentId}:${reference.contentCreatedAt}`,
            title: reference.title.trim(),
          }
    );
    return {
      id: card.id,
      deckId: card.deckId,
      type: card.type,
      prompt: card.prompt as PluginFlashcardDraft["prompt"],
      detail: card.detail as PluginFlashcardDraft["detail"],
      data: card.data,
      tags: card.tags,
      difficulty: card.difficulty,
      references: savedReferences,
    };
  };
  const unavailable = async (): Promise<never> => {
    throw new Error("移动端尚未开放闪卡 AI 生成");
  };
  const adapter: FlashcardsAdapter = {
    async listDecks(context) {
      return (await call<FlashcardDeck[]>(context, "listDecks")).map(
        ({ id, name, description, emoji }) => ({ id, name, description, emoji })
      );
    },
    async createDeck(context, input) {
      if (typeof input?.name !== "string" || !input.name.trim())
        throw new Error("卡组名称不能为空");
      for (const field of [input.description, input.emoji])
        if (field !== undefined && typeof field !== "string") throw new Error("卡组信息无效");
      await writePermission(context);
      const { id, name, description, emoji } = await call<FlashcardDeck>(context, "createDeck", {
        name: input.name.trim(),
        description: input.description,
        emoji: input.emoji,
      });
      changed();
      return { id, name, description, emoji };
    },
    createCard: (context, input) => create(context, input),
    openCreate(context, options = {}) {
      if (!globalThis.navigator?.userActivation?.isActive)
        throw new Error("只能在用户点击或按键后打开建卡");
      check(context);
      if (options.mode !== undefined && options.mode !== "manual") return unavailable();
      if (options.title !== undefined && typeof options.title !== "string")
        throw new Error("建卡标题无效");
      if (
        options.deckId !== undefined &&
        (!Number.isSafeInteger(options.deckId) || options.deckId <= 0)
      )
        throw new Error("卡组编号无效");
      if (current) throw new Error("请先完成或关闭当前建卡流程");
      return new Promise<PluginFlashcardCreateResult>((resolve, reject) => {
        const controller = new AbortController();
        const cards: PluginCreatedFlashcard[] = [];
        let saving = false;
        let initialReferences = options.references;
        let prepared: Promise<import("slate").Descendant[]> | undefined;
        const guard = () => {
          check(context);
          controller.signal.throwIfAborted();
          if (current !== request) throw new Error("建卡请求已失效");
        };
        const finish = (status: PluginFlashcardCreateResult["status"]) => {
          if (controller.signal.aborted) return;
          controller.abort();
          context.signal.removeEventListener("abort", abort);
          current = null;
          abortPending = undefined;
          emit();
          resolve({ status, cards });
        };
        const abort = () => finish("cancelled");
        const request: MobileFlashcardRequest = {
          id: ++sequence,
          options,
          signal: controller.signal,
          prepare() {
            guard();
            prepared ??= (async () => {
              const content =
                typeof options.content === "string"
                  ? await mobileImportFromMarkdown(options.content)
                  : options.content;
              if (content !== undefined) assertContentNodes(content);
              if (options.references === undefined && content?.length)
                initialReferences = [
                  {
                    refType: "custom",
                    customContent: content,
                    title: options.title?.trim() || "参考资料",
                  },
                ];
              await references(context, initialReferences);
              guard();
              return content ?? [];
            })().catch(error => {
              prepared = undefined;
              throw error;
            });
            return prepared;
          },
          async save(input) {
            guard();
            if (saving) throw new Error("正在保存，请稍候");
            saving = true;
            try {
              await request.prepare();
              const card = await create(
                context,
                { ...input, references: initialReferences },
                guard
              );
              guard();
              cards.push(card);
            } finally {
              saving = false;
            }
          },
          async createDeck(input) {
            guard();
            if (saving) throw new Error("正在保存，请稍候");
            if (!input.name.trim()) throw new Error("卡组名称不能为空");
            saving = true;
            try {
              const deck = await call<FlashcardDeck>(context, "createDeck", {
                ...input,
                name: input.name.trim(),
              });
              guard();
              changed();
              return { id: deck.id };
            } finally {
              saving = false;
            }
          },
          close: () => {
            if (!saving) finish("cancelled");
          },
          dismiss: abort,
          complete: () => {
            guard();
            if (!saving) finish("completed");
          },
        };
        current = request;
        abortPending = abort;
        context.signal.addEventListener("abort", abort, { once: true });
        emit();
        try {
          navigator.push("pluginFlashcardCreate", { requestId: request.id });
        } catch (error) {
          reject(error);
          abort();
        }
      });
    },
    generate: unavailable,
    generateAndSave: unavailable,
  };
  return {
    adapter,
    getSnapshot: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      disposed = true;
      abortPending?.();
      listeners.clear();
    },
  };
}
export type MobileFlashcards = ReturnType<typeof createMobileFlashcards>;
