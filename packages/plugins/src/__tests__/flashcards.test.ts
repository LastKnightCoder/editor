import { describe, expect, it, vi } from "vitest";
import { definePlugin, type PluginContext } from "../index";
import { createMemoryStorage, PluginHost, type FlashcardsAdapter } from "../host";

async function setup(flashcards?: FlashcardsAdapter) {
  let context!: PluginContext;
  const host = new PluginHost({ workspaceId: "work", storage: createMemoryStorage(), flashcards });
  host.registerTrusted(
    definePlugin({
      id: "test.flashcards",
      name: "闪卡测试",
      version: "1.0.0",
      create: () => ({
        activate(ctx) {
          context = ctx;
        },
      }),
    })
  );
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
});
