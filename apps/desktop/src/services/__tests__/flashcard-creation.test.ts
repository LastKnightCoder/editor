import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryObserver } from "@tanstack/react-query";
import type { CreateFlashcardInput, Flashcard } from "@/types";
import type { Descendant } from "slate";

vi.mock("@/stores/useSettingStore", async () => {
  const { create } = await import("zustand");
  return {
    default: create(() => ({
      setting: {
        database: { active: "a" },
        llmProviders: [{ id: "provider", models: [{ id: "model" }] }],
        llmUsageSettings: { flashcardGeneration: { providerId: "provider", modelId: "model" } },
      },
    })),
  };
});
vi.mock("@/utils/markdown", () => ({
  importFromMarkdown: (text: string) => [{ type: "paragraph", children: [{ text }] }],
  getMarkdown: (nodes: { children: { text: string }[] }[]) =>
    nodes.map(node => node.children.map(leaf => leaf.text).join("")).join("\n"),
}));
vi.mock("@/constants/prompts", () => ({
  FLASHCARD_GENERATION_PROMPT: "制卡",
  FLASHCARD_GENERATION_USER_PROMPT: (text: string) => text,
}));
vi.mock("@/services/piLLM", () => ({ piStreamText: vi.fn() }));
vi.mock("@/commands/flashcard", () => ({
  getFlashcardDeck: vi.fn(async () => ({ id: 1, name: "组" })),
  createFlashcard: vi.fn(),
  createFlashcardDeck: vi.fn(),
  listFlashcardDecks: vi.fn(async () => []),
}));

import settings from "@/stores/useSettingStore";
import { piStreamText } from "@/services/piLLM";
import * as commands from "@/commands/flashcard";
import { currentCommandScope } from "../command-context";
import {
  flashcardCreationRequests,
  generateFlashcardDrafts,
  normalizeFlashcardOptions,
  openFlashcardCreation,
} from "../flashcard-creation";
import { createDesktopFlashcards } from "@/app/plugins/flashcards";
import {
  PluginPermissionError,
  type PluginAICapabilityClient,
  type PluginContext,
  type PluginFlashcardDraft,
} from "@tau/plugins";
import { queryClient } from "@/queryClient";
import { flashcardKeys } from "@/features/flashcards/queries";

const chat = vi.fn<PluginAICapabilityClient["chat"]>();
const ai: PluginAICapabilityClient = {
  chat,
  async *stream(request) {
    yield { type: "done", result: await chat(request) };
  },
};
const context = (signal = new AbortController().signal) => {
  const ctx = {
    pluginId: "test.flashcards",
    signal,
    ai: { requestCapability: vi.fn(async () => ai) },
    permissions: { query: vi.fn(async () => "granted"), request: vi.fn(async () => true) },
    content: { read: vi.fn(async () => ({ revision: "1", nodes: [] })) },
  } as unknown as PluginContext;
  const api = createDesktopFlashcards("a");
  Object.assign(ctx, {
    flashcards: {
      generate: (options: Parameters<PluginContext["flashcards"]["generate"]>[0]) =>
        api.generate(ctx, options),
      createCard: (input: Parameters<PluginContext["flashcards"]["createCard"]>[0]) =>
        api.createCard(ctx, input),
    },
  });
  return ctx;
};
const output = JSON.stringify([{ type: "qa", prompt: "问题", data: { answer: "答案" } }]);
const persistedCard = (input: CreateFlashcardInput, id = 1): Flashcard => ({
  ...input,
  id,
  detail: input.detail ?? [],
  tags: input.tags ?? [],
  difficulty: input.difficulty ?? "standard",
  dueTime: 0,
  lastReviewTime: null,
  reviewCount: 0,
  memoryStability: null,
  memoryDifficulty: null,
  status: "new",
  createTime: 0,
  updateTime: 0,
  references: (input.references ?? []).map((reference, index) => ({
    id: index + 1,
    cardId: id,
    contentId: reference.contentId ?? 42,
    refType: reference.refType,
    title: reference.title,
    createTime: 0,
    updateTime: 0,
    content: {
      id: reference.contentId ?? 42,
      content: reference.customContent ?? [],
      createTime: 0,
      updateTime: 0,
      count: 0,
      refCount: 1,
    },
  })),
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(commands.getFlashcardDeck).mockResolvedValue({ id: 1, name: "组" } as never);
  vi.mocked(commands.createFlashcard).mockImplementation(async input => persistedCard(input));
  settings.setState(state => ({
    setting: { ...state.setting, database: { ...state.setting.database, active: "a" } },
  }));
  chat.mockResolvedValue({ text: output, usage: null });
});
afterEach(() => queryClient.clear());

describe("统一制卡服务", () => {
  it("通用 AI 能力申请被拒绝时，不生成或写入闪卡", async () => {
    const ctx = context();
    vi.mocked(ctx.ai.requestCapability).mockRejectedValue(
      new PluginPermissionError("ai:flashcardGeneration", "denied")
    );
    await expect(
      createDesktopFlashcards("a").generate(ctx, { content: "资料" })
    ).rejects.toMatchObject({ permission: "ai:flashcardGeneration" });
    expect(ctx.ai.requestCapability).toHaveBeenCalledWith("flashcardGeneration");
    expect(chat).not.toHaveBeenCalled();
    expect(commands.createFlashcard).not.toHaveBeenCalled();
  });
  it.each(["AI_DISABLED", "AI_QUOTA_EXCEEDED"])(
    "插件 AI 被拒绝时不借用应用模型或落库：%s",
    async code => {
      chat.mockRejectedValue(new Error(code));
      await expect(
        createDesktopFlashcards("a").generateAndSave(context(), {
          content: "资料",
          deckId: 1,
        })
      ).rejects.toThrow(code);
      expect(piStreamText).not.toHaveBeenCalled();
      expect(commands.createFlashcard).not.toHaveBeenCalled();
    }
  );

  it("AI 返回前撤销写入权限，不保存已生成的草稿", async () => {
    const ctx = context();
    chat.mockImplementation(async () => {
      vi.mocked(ctx.permissions.query).mockImplementation(async permission =>
        permission === "flashcards:write" ? "denied" : "granted"
      );
      return { text: output, usage: null };
    });
    await expect(
      createDesktopFlashcards("a").generateAndSave(ctx, {
        content: "资料",
        deckId: 1,
      })
    ).rejects.toMatchObject({ permission: "flashcards:write", reason: "denied" });
    expect(commands.createFlashcard).not.toHaveBeenCalled();
  });

  it("现有正文引用必须有效且获准读取，裸 ID 不再接受", async () => {
    const ctx = context();
    const api = createDesktopFlashcards("a");
    const draft = {
      deckId: 1,
      type: "qa" as const,
      prompt: [
        { type: "paragraph" as const, children: [{ type: "formatted" as const, text: "题目" }] },
      ],
      data: { answer: "答案" },
    };
    await expect(
      api.createCard(ctx, {
        ...draft,
        references: [{ refType: "content", title: "来源", contentId: 12 } as never],
      })
    ).rejects.toThrow("正文引用无效");
    vi.mocked(ctx.content.read).mockResolvedValueOnce(null);
    const input = {
      ...draft,
      references: [{ refType: "content" as const, title: "来源", contentRef: "12:1" }],
    };
    await expect(api.createCard(ctx, input)).rejects.toThrow("正文不存在或已失效");
    vi.mocked(ctx.content.read).mockRejectedValueOnce(
      new PluginPermissionError("cards:read", "denied")
    );
    await expect(api.createCard(ctx, input)).rejects.toMatchObject({ permission: "cards:read" });
    expect(commands.createFlashcard).not.toHaveBeenCalled();
  });

  it("后台请求不能打开窗口，用户触发的 AI 窗口仍使用插件授权通道", async () => {
    Object.defineProperty(navigator, "userActivation", {
      configurable: true,
      value: { isActive: false },
    });
    const api = createDesktopFlashcards("a");
    await expect(api.openCreate(context(), {})).rejects.toThrow("用户点击");
    expect(flashcardCreationRequests.getSnapshot()).toBeNull();
    Object.defineProperty(navigator, "userActivation", {
      configurable: true,
      value: { isActive: true },
    });
    const denied = context();
    vi.mocked(denied.ai.requestCapability).mockRejectedValue(
      new PluginPermissionError("ai:flashcardGeneration", "denied")
    );
    await expect(api.openCreate(denied, { mode: "ai", content: "资料" })).rejects.toMatchObject({
      permission: "ai:flashcardGeneration",
      reason: "denied",
    });
    const ctx = context();
    const pending = api.openCreate(ctx, { mode: "ai", content: "资料" });
    await vi.waitFor(() => expect(flashcardCreationRequests.getSnapshot()).not.toBeNull());
    const request = flashcardCreationRequests.getSnapshot();
    if (!request?.generate) throw new Error("插件生成器未接入窗口");
    await request.generate(request.options.content, new AbortController().signal);
    expect(ctx.ai.requestCapability).toHaveBeenCalledWith("flashcardGeneration");
    expect(chat).toHaveBeenCalledWith(expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(piStreamText).not.toHaveBeenCalled();
    request.settle({ status: "cancelled", cards: [] });
    await pending;
  });

  it("创建卡组后立即刷新来源窗口中的卡组选择查询", async () => {
    const key = flashcardKeys.decks("a");
    queryClient.setQueryData(key, [{ id: 1, name: "原组" }]);
    queryClient.setQueryData(flashcardKeys.decks("b"), [{ id: 1, name: "其他库" }]);
    const observer = new QueryObserver(queryClient, {
      queryKey: key,
      queryFn: () => commands.listFlashcardDecks(),
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    const deck = { id: 2, name: "新组" };
    vi.mocked(commands.createFlashcardDeck).mockResolvedValue(deck as never);
    vi.mocked(commands.listFlashcardDecks).mockResolvedValue([deck] as never);
    try {
      await createDesktopFlashcards("a").createDeck(context(), { name: "新组" });
      expect(observer.getCurrentResult().data).toEqual([deck]);
      expect(commands.listFlashcardDecks).toHaveBeenCalledTimes(1);
      expect(queryClient.getQueryState(flashcardKeys.decks("b"))?.isInvalidated).toBe(false);
    } finally {
      unsubscribe();
    }
  });

  it("直接创建刷新原库快照、计数及首页，返回资料可再次用于创建", async () => {
    const keys = [flashcardKeys.snapshot("a"), flashcardKeys.due("a"), ["home", "snapshot"]];
    keys.forEach(key => queryClient.setQueryData(key, {}));
    queryClient.setQueryData(flashcardKeys.snapshot("b"), {});
    const api = createDesktopFlashcards("a");
    const customContent: Descendant[] = [
      { type: "paragraph", children: [{ type: "formatted", text: "参考正文" }] },
    ];
    const card = await api.createCard(context(), {
      deckId: 1,
      type: "qa",
      prompt: [{ type: "paragraph", children: [{ type: "formatted", text: "问题" }] }],
      data: { answer: "答案" },
      references: [
        { refType: "custom", title: "自定义资料", customContent },
        { refType: "content", title: "已有正文", contentRef: "12:0" },
      ],
    });
    expect(card.references).toEqual([
      { refType: "custom", title: "自定义资料", customContent },
      { refType: "content", title: "已有正文", contentRef: "12:0" },
    ]);
    expect(await api.createCard(context(), card)).toEqual(card);
    keys.forEach(key => expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true));
    expect(queryClient.getQueryState(flashcardKeys.snapshot("b"))?.isInvalidated).toBe(false);
  });

  it("直接创建失败不失效尚未变化的缓存", async () => {
    const key = flashcardKeys.decks("a");
    queryClient.setQueryData(key, []);
    vi.mocked(commands.createFlashcardDeck).mockRejectedValue(new Error("写入失败"));
    await expect(
      createDesktopFlashcards("a").createDeck(context(), { name: "失败组" })
    ).rejects.toThrow("写入失败");
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
  });

  it("文本转富文本并保留来源；显示期间固定输入快照", async () => {
    const options = { content: "原文", title: "资料" };
    const pending = openFlashcardCreation(options);
    options.content = "改文";
    expect(flashcardCreationRequests.getSnapshot()?.options.references).toEqual([
      {
        refType: "custom",
        title: "资料",
        customContent: [{ type: "paragraph", children: [{ text: "原文" }] }],
      },
    ]);
    await expect(openFlashcardCreation()).rejects.toThrow("当前制卡窗口");
    flashcardCreationRequests.getSnapshot()?.settle({ status: "cancelled", cards: [] });
    expect(await pending).toEqual({ status: "cancelled", cards: [] });
    expect(flashcardCreationRequests.getSnapshot()).toBeNull();
  });

  it("插件停用与切库立即关闭并拒绝请求，旧结算不关闭新窗口", async () => {
    const controller = new AbortController();
    const first = openFlashcardCreation({}, { databaseName: "a", signal: controller.signal });
    const old = flashcardCreationRequests.getSnapshot();
    if (!old) throw new Error("制卡请求未创建");
    const firstRejected = expect(first).rejects.toBeDefined();
    controller.abort();
    await firstRejected;
    const second = openFlashcardCreation();
    const secondRejected = expect(second).rejects.toBeDefined();
    old.settle({ status: "cancelled", cards: [] });
    expect(flashcardCreationRequests.getSnapshot()).not.toBeNull();
    settings.setState(state => ({
      setting: { ...state.setting, database: { ...state.setting.database, active: "b" } },
    }));
    await secondRejected;
    expect(flashcardCreationRequests.getSnapshot()).toBeNull();
  });

  it("生成只返回草稿和来源，不写入闪卡", async () => {
    const cards = await generateFlashcardDrafts(
      { content: "原文", title: "资料" },
      { databaseName: "a" },
      ai
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      type: "qa",
      data: { answer: "答案" },
      references: [{ refType: "custom", title: "资料" }],
    });
    expect(commands.createFlashcard).not.toHaveBeenCalled();
    expect(chat).toHaveBeenCalledWith(expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(piStreamText).not.toHaveBeenCalled();
  });

  it("显式自动保存返回成功项与失败下标，写入固定原库", async () => {
    const key = flashcardKeys.snapshot("a");
    queryClient.setQueryData(key, {});
    chat.mockResolvedValue({
      text: JSON.stringify(Array(3).fill(JSON.parse(output)[0])),
      usage: null,
    });
    vi.mocked(commands.createFlashcard).mockImplementation(async input => {
      expect(currentCommandScope()?.databaseName).toBe("a");
      if (vi.mocked(commands.createFlashcard).mock.calls.length === 2) throw new Error("写入失败");
      return persistedCard(input, vi.mocked(commands.createFlashcard).mock.calls.length);
    });
    const result = await createDesktopFlashcards("a").generateAndSave(context(), {
      content: "原文",
      deckId: 1,
    });
    expect(result.cards.map(card => card.id)).toEqual([1, 3]);
    expect(result.failed).toEqual([{ index: 1, message: "写入失败" }]);
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    expect(result.cards[0].references?.[0]).toMatchObject({
      refType: "custom",
      customContent: [{ type: "paragraph", children: [{ text: "原文" }] }],
    });
  });

  it("部分保存后取消仍刷新已提交记录的原库缓存", async () => {
    const controller = new AbortController();
    const key = flashcardKeys.snapshot("a");
    queryClient.setQueryData(key, {});
    chat.mockResolvedValue({
      text: JSON.stringify(Array(2).fill(JSON.parse(output)[0])),
      usage: null,
    });
    vi.mocked(commands.createFlashcard).mockImplementation(async input => {
      if (vi.mocked(commands.createFlashcard).mock.calls.length === 2) {
        controller.abort(new Error("插件已停用"));
        throw new Error("写入已取消");
      }
      return persistedCard(input);
    });
    await expect(
      createDesktopFlashcards("a").generateAndSave(context(controller.signal), {
        content: "原文",
        deckId: 1,
      })
    ).rejects.toThrow("插件已停用");
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it("无答案的富文本填空题在插件创建和模型生成时均不落库", async () => {
    const draft = {
      type: "cloze" as const,
      prompt: [
        {
          type: "paragraph",
          children: [{ type: "flashcard-blank", blankId: "b", children: [{ text: "巴黎" }] }],
        },
      ],
      data: {},
    } as unknown as PluginFlashcardDraft;
    const api = createDesktopFlashcards("a");
    await expect(api.createCard(context(), { ...draft, deckId: 1 })).rejects.toThrow(
      "填空答案不能为空"
    );
    chat.mockResolvedValue({ text: JSON.stringify([draft]), usage: null });
    await expect(api.generateAndSave(context(), { content: "原文", deckId: 1 })).rejects.toThrow(
      "填空答案不能为空"
    );
    expect(commands.createFlashcard).not.toHaveBeenCalled();
  });

  it("拒绝空内容、无效题型和不存在的卡组", async () => {
    await expect(
      generateFlashcardDrafts({ content: "" }, { databaseName: "a" }, ai)
    ).rejects.toThrow("不能为空");
    expect(() => normalizeFlashcardOptions({ deckId: -1 })).toThrow("ID 无效");
    const api = createDesktopFlashcards("a");
    await expect(
      api.createCard(context(), { deckId: 1, type: "unknown" as never, prompt: [], data: {} })
    ).rejects.toThrow("题型无效");
    vi.mocked(commands.getFlashcardDeck).mockResolvedValueOnce(null);
    await expect(api.generateAndSave(context(), { content: "原文", deckId: 1 })).rejects.toThrow(
      "不存在"
    );
    expect(commands.createFlashcard).not.toHaveBeenCalled();
  });

  it("切库取消模型，迟到结果不能写入", async () => {
    let complete!: (value: never) => void;
    const cancel = vi.fn();
    chat.mockImplementation(({ signal }) => {
      signal?.addEventListener("abort", cancel);
      return new Promise(resolve => {
        complete = resolve;
      });
    });
    const pending = generateFlashcardDrafts({ content: "原文" }, { databaseName: "a" }, ai);
    const rejected = expect(pending).rejects.toThrow("已取消");
    settings.setState(state => ({
      setting: { ...state.setting, database: { ...state.setting.database, active: "b" } },
    }));
    expect(cancel).toHaveBeenCalled();
    complete({ text: output, usage: null } as never);
    await rejected;
  });

  it("模型返回未知题型时拒绝整批，不产生写入", async () => {
    chat.mockResolvedValue({
      text: JSON.stringify([
        { type: "qa", prompt: "有效题目", data: { answer: "答案" } },
        { type: "invalid", prompt: "无效题目", data: {} },
      ]),
      usage: null,
    });
    await expect(
      createDesktopFlashcards("a").generateAndSave(context(), {
        content: "原文",
        deckId: 1,
      })
    ).rejects.toThrow("题型无效");
    expect(commands.createFlashcard).not.toHaveBeenCalled();
  });
});
