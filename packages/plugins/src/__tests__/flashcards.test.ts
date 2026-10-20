import { describe, expect, it, vi } from "vitest";
import {
  definePlugin,
  PluginPermissionError,
  type PluginContext,
  type PluginPermission,
} from "../index";
import { createMemoryStorage, PluginHost, type FlashcardsAdapter } from "../host";

async function setup(
  flashcards?: FlashcardsAdapter,
  declared: readonly PluginPermission[] = ["flashcards:read", "flashcards:write"],
  ensure = vi.fn<() => Promise<void>>(async () => undefined)
) {
  let context!: PluginContext;
  const host = new PluginHost({
    workspaceId: "work",
    storage: createMemoryStorage(),
    flashcards,
    permissions: { ensure, query: async () => "granted", request: async () => true },
  });
  host.registerTrusted({
    ...definePlugin({
      id: "test.flashcards",
      name: "闪卡测试",
      version: "1.0.0",
      create: () => ({
        activate(ctx) {
          context = ctx;
        },
      }),
    }),
    permissions: declared,
  });
  await host.enable("test.flashcards");
  return { host, context };
}

function adapter(overrides: Partial<FlashcardsAdapter> = {}): FlashcardsAdapter {
  return {
    listDecks: async () => [],
    createDeck: async (_ctx, input) => ({ ...input, id: 1 }),
    createCard: async (_ctx, input) => ({ ...input, id: 2 }),
    openCreate: async () => ({ status: "cancelled", cards: [] }),
    generate: async () => [],
    generateAndSave: async () => ({ cards: [], failed: [] }),
    ...overrides,
  };
}

describe("插件闪卡 API", () => {
  it("六项能力转发到当前上下文，输入和输出为独立快照", async () => {
    const createDeck = vi.fn(async (_ctx, input) => ({ ...input, id: 1 }));
    const { host, context } = await setup(adapter({ createDeck }));
    const input = { name: "测试组" };
    expect(await context.flashcards.createDeck(input)).toEqual({ name: "测试组", id: 1 });
    expect(createDeck.mock.calls[0][0]).toBe(context);
    expect(createDeck.mock.calls[0][1]).not.toBe(input);
    expect(await context.flashcards.listDecks()).toEqual([]);
    expect(await context.flashcards.openCreate()).toEqual({ status: "cancelled", cards: [] });
    expect(await context.flashcards.generate({ content: "原文" })).toEqual([]);
    expect(await context.flashcards.generateAndSave({ content: "原文", deckId: 1 })).toEqual({
      cards: [],
      failed: [],
    });
    expect(
      await context.flashcards.createCard({ deckId: 1, type: "qa", prompt: [], data: {} })
    ).toMatchObject({ id: 2, deckId: 1 });
    await host.dispose();
  });

  it("停用取消上下文并拒绝旧调用及迟到结果", async () => {
    let complete!: (value: { id: number; name: string }[]) => void;
    const listDecks = vi.fn(
      () =>
        new Promise<{ id: number; name: string }[]>(resolve => {
          complete = resolve;
        })
    );
    const { host, context } = await setup(adapter({ listDecks }));
    const pending = context.flashcards.listDecks();
    const rejected = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(listDecks).toHaveBeenCalledOnce());
    await host.disable("test.flashcards");
    expect(context.signal.aborted).toBe(true);
    complete([]);
    await rejected;
    await expect(context.flashcards.createDeck({ name: "旧组" })).rejects.toThrow();
    expect(listDecks).toHaveBeenCalledTimes(1);
  });

  it("未提供能力的宿主明确拒绝", async () => {
    const { host, context } = await setup();
    await expect(context.flashcards.openCreate()).rejects.toThrow("不支持闪卡");
    await host.dispose();
  });

  it("未声明读写权限时不调用适配器，窗口入口不隐式读取业务数据", async () => {
    const listDecks = vi.fn(async () => []);
    const createDeck = vi.fn(async () => ({ id: 1, name: "组" }));
    const { host, context } = await setup(adapter({ listDecks, createDeck }), []);
    await expect(context.flashcards.listDecks()).rejects.toMatchObject({ reason: "undeclared" });
    await expect(context.flashcards.createDeck({ name: "组" })).rejects.toMatchObject({
      reason: "undeclared",
    });
    await expect(
      context.flashcards.generateAndSave({ content: "资料", deckId: 1 })
    ).rejects.toMatchObject({ reason: "undeclared" });
    expect(listDecks).not.toHaveBeenCalled();
    expect(createDeck).not.toHaveBeenCalled();
    expect(await context.flashcards.openCreate()).toEqual({ status: "cancelled", cards: [] });
    await host.dispose();
  });

  it("拒绝授权不会写入，授权等待期间保持参数快照", async () => {
    const createDeck = vi.fn(async (_ctx, input) => ({ ...input, id: 1 }));
    const ensure = vi.fn<() => Promise<void>>(async () => {
      throw new PluginPermissionError("flashcards:write", "denied");
    });
    const { host, context } = await setup(adapter({ createDeck }), ["flashcards:write"], ensure);
    await expect(context.flashcards.createDeck({ name: "拒绝" })).rejects.toMatchObject({
      reason: "denied",
    });
    expect(createDeck).not.toHaveBeenCalled();
    let grant!: () => void;
    ensure.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          grant = resolve;
        })
    );
    const input = { name: "原名称" };
    const pending = context.flashcards.createDeck(input);
    input.name = "后来修改";
    grant();
    expect(await pending).toMatchObject({ name: "原名称" });
    await host.dispose();
  });
});
