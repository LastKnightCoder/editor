import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { definePlugin, type PluginContext, type PluginFlashcardDraft } from "@tau/plugins";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { createMobileFlashcards, validateMobileFlashcard } from "./flashcards";
import type { MobileDataAdapter } from "./data";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../services/editorMarkdown", () => ({
  mobileImportFromMarkdown: vi.fn(async (text: string) => [
    { type: "paragraph", children: [{ type: "formatted", text }] },
  ]),
}));
const draft: PluginFlashcardDraft & { deckId: number } = {
  deckId: 1,
  type: "qa",
  prompt: [{ type: "paragraph", children: [{ type: "formatted", text: "题干" }] }],
  data: { answer: "答案" },
};
const cleanups: (() => void | Promise<void>)[] = [];
function setup() {
  const lifetime = new AbortController();
  const query = vi.fn(async () => "granted" as const);
  const read = vi.fn(async () => ({ nodes: draft.prompt }));
  const context = {
    pluginId: "test.flashcards",
    workspaceId: "one.db",
    signal: lifetime.signal,
    permissions: { query },
    content: { read },
  } as unknown as PluginContext;
  const prepareContent = vi.fn(async () => ({ nodes: draft.prompt, contracts: {}, count: 2 }));
  const push = vi.fn();
  const changed = vi.fn();
  const service = createMobileFlashcards(
    "one.db",
    "session-one",
    { prepareContent } as unknown as MobileDataAdapter,
    { push },
    changed
  );
  cleanups.push(service.dispose);
  return { service, context, lifetime, query, read, prepareContent, push, changed };
}
function request(service: ReturnType<typeof createMobileFlashcards>) {
  const value = service.getSnapshot();
  if (!value) throw new Error("建卡请求缺失");
  return value;
}
beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.stubGlobal("navigator", { userActivation: { isActive: true } });
});
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.unstubAllGlobals();
});

it("牌组查询只返回公开字段，创建固定工作区并刷新", async () => {
  const { service, context, changed } = setup();
  const deck = { id: 1, name: "学习", description: "", emoji: "书", stats: { totalCards: 10 } };
  vi.mocked(invoke).mockResolvedValueOnce([deck]).mockResolvedValueOnce(deck);
  expect(await service.adapter.listDecks(context)).toEqual([
    { id: 1, name: "学习", description: "", emoji: "书" },
  ]);
  await service.adapter.createDeck(context, { name: " 学习 " });
  expect(invoke).toHaveBeenLastCalledWith("plugin_flashcards", {
    database: "one.db",
    token: "session-one",
    pluginId: context.pluginId,
    method: "createDeck",
    payload: { name: "学习", description: undefined, emoji: undefined },
  });
  expect(changed).toHaveBeenCalledOnce();
});
it("创建闪卡复验写权限，正确映射正文引用身份和自定义正文", async () => {
  const { service, context, read } = setup();
  vi.mocked(invoke).mockResolvedValue({
    ...draft,
    id: 9,
    detail: [],
    tags: [],
    difficulty: "standard",
    dueTime: 123,
    references: [{ secret: true }],
  });
  const references = [
    { refType: "content" as const, contentRef: "3:4", title: "正文" },
    { refType: "custom" as const, customContent: draft.prompt, title: "资料" },
  ];
  const result = await service.adapter.createCard(context, { ...draft, references });
  expect(read).toHaveBeenCalledWith("3:4", { format: "nodes" });
  expect(invoke).toHaveBeenCalledWith(
    "plugin_flashcards",
    expect.objectContaining({
      payload: expect.objectContaining({
        references: [
          { refType: "content", contentId: 3, contentCreatedAt: 4, title: "正文" },
          {
            refType: "custom",
            customContent: draft.prompt,
            contracts: {},
            count: 2,
            title: "资料",
          },
        ],
      }),
    })
  );
  expect(result).toMatchObject({ id: 9, deckId: 1, references });
  expect(result).not.toHaveProperty("dueTime");
});
it("准备资料期间停用，拒绝迟到写入", async () => {
  const { service, context, lifetime, read } = setup();
  read.mockImplementationOnce(async () => {
    lifetime.abort();
    return { nodes: draft.prompt };
  });
  await expect(
    service.adapter.createCard(context, {
      ...draft,
      references: [{ refType: "content", contentRef: "1:2", title: "正文" }],
    })
  ).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
});
it("手动流程预填 Markdown，取消不保存且返回 cancelled", async () => {
  const { service, context, push } = setup();
  const pending = service.adapter.openCreate(context, { content: "题干", title: "来源" });
  const current = request(service);
  expect(push).toHaveBeenCalledWith("pluginFlashcardCreate", { requestId: current.id });
  expect(await current.prepare()).toEqual(draft.prompt);
  current.close();
  await expect(pending).resolves.toEqual({ status: "cancelled", cards: [] });
  expect(invoke).not.toHaveBeenCalled();
});
it("手动保存不要求插件整类写权限，completed 返回真实已保存卡片", async () => {
  const { service, context, query } = setup();
  vi.mocked(invoke).mockResolvedValue({
    ...draft,
    id: 5,
    detail: [],
    tags: [],
    difficulty: "standard",
  });
  const pending = service.adapter.openCreate(context);
  const current = request(service);
  await current.save(draft);
  current.complete();
  const result = await pending;
  expect(result.status).toBe("completed");
  expect(result.cards[0].id).toBe(5);
  expect(query).not.toHaveBeenCalled();
});
it("手动题干默认作为自定义来源保存，用户可在流程中创建卡组", async () => {
  const { service, context } = setup();
  const pending = service.adapter.openCreate(context, { content: "题干", title: "来源" });
  const current = request(service);
  await current.prepare();
  vi.mocked(invoke)
    .mockResolvedValueOnce({ id: 2 })
    .mockResolvedValueOnce({
      ...draft,
      id: 5,
      deckId: 2,
      detail: [],
      tags: [],
      difficulty: "standard",
    });
  await expect(current.createDeck({ name: "新组" })).resolves.toEqual({ id: 2 });
  await current.save({ ...draft, deckId: 2 });
  current.complete();
  await expect(pending).resolves.toMatchObject({
    cards: [{ references: [{ refType: "custom", title: "来源", customContent: draft.prompt }] }],
  });
});
it.each(["abort", "dispose"])("%s 关闭未完成请求并阻止旧回调", async operation => {
  const { service, context, lifetime } = setup();
  const pending = service.adapter.openCreate(context);
  const current = request(service);
  if (operation === "abort") lifetime.abort();
  else service.dispose();
  await expect(pending).resolves.toEqual({ status: "cancelled", cards: [] });
  await expect(current.save(draft)).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
});
it("拒绝无手势、重复打开及 AI 能力", async () => {
  const { service, context } = setup();
  vi.stubGlobal("navigator", { userActivation: { isActive: false } });
  expect(() => service.adapter.openCreate(context)).toThrow("用户点击");
  vi.stubGlobal("navigator", { userActivation: { isActive: true } });
  await expect(service.adapter.openCreate(context, { mode: "ai" })).rejects.toThrow("AI");
  await expect(service.adapter.generate(context, { content: "内容" })).rejects.toThrow("AI");
  await expect(
    service.adapter.generateAndSave(context, { content: "内容", deckId: 1 })
  ).rejects.toThrow("AI");
  const pending = service.adapter.openCreate(context);
  expect(() => service.adapter.openCreate(context)).toThrow("当前建卡");
  request(service).close();
  await pending;
});
it("写权限撤销后不落库，已保存后取消保留真实结果", async () => {
  const { service, context } = setup();
  const denied = {
    ...context,
    permissions: { ...context.permissions, query: async () => "denied" as const },
  } as PluginContext;
  await expect(service.adapter.createCard(denied, draft)).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
  vi.mocked(invoke).mockResolvedValue({
    ...draft,
    id: 5,
    detail: [],
    tags: [],
    difficulty: "standard",
  });
  const pending = service.adapter.openCreate(context);
  const current = request(service);
  await current.save(draft);
  current.close();
  await expect(pending).resolves.toMatchObject({ status: "cancelled", cards: [{ id: 5 }] });
});
it("SDK 未声明权限时不进入原生读写，手动入口不要求闪卡授权", async () => {
  const { service } = setup();
  let context!: PluginContext;
  const host = new PluginHost({
    workspaceId: "one.db",
    storage: createMemoryStorage(),
    flashcards: service.adapter,
    permissions: {
      query: async () => "granted",
      ensure: async () => undefined,
      request: async () => true,
    },
  });
  cleanups.push(() => host.dispose());
  host.registerTrusted(
    definePlugin({
      id: "test.flashcards",
      name: "测试",
      version: "1.0.0",
      create: () => ({
        activate(value) {
          context = value;
        },
      }),
    })
  );
  await host.enable("test.flashcards");
  await expect(context.flashcards.listDecks()).rejects.toThrow();
  await expect(context.flashcards.createDeck({ name: "学习" })).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
  const pending = context.flashcards.openCreate();
  request(service).close();
  await expect(pending).resolves.toEqual({ status: "cancelled", cards: [] });
});
it.each([
  { ...draft, deckId: 0 },
  { ...draft, prompt: [] },
  { ...draft, data: { answer: "" } },
  { ...draft, type: "boolean", data: {} },
  {
    ...draft,
    type: "single-choice",
    data: {
      options: [
        { id: "a", label: "甲", isCorrect: true },
        { id: "b", label: "乙", isCorrect: true },
      ],
    },
  },
  { ...draft, type: "cloze" },
])("无效题型数据不允许落库 %j", input => {
  expect(() =>
    validateMobileFlashcard(input as PluginFlashcardDraft & { deckId: number })
  ).toThrow();
});
