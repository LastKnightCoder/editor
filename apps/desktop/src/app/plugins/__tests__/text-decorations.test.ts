import { describe, expect, it, vi } from "vitest";
import { definePlugin, type PluginContext } from "@tau/plugins";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { DesktopTextDecorations } from "../text-decorations";

describe("正文文字标记", () => {
  it("刷新、撤权和切库清理使旧命中失效，未声明的正文不会交付", async () => {
    let allowed = true;
    const registry = new DesktopTextDecorations({
      rowState: () => (allowed ? "once" : "none"),
      subscribe: () => () => {},
    });
    let context!: PluginContext;
    const host = new PluginHost({
      workspaceId: "one",
      storage: createMemoryStorage(),
      textDecorations: registry,
      permissions: {
        query: async () => "granted",
        request: async () => true,
        ensure: async () => {},
      },
    });
    host.registerTrusted({
      ...definePlugin({
        id: "words",
        name: "词表",
        version: "1",
        create: () => ({
          activate(ctx) {
            context = ctx;
          },
        }),
      }),
      permissions: ["articles:read"],
    });
    await host.enable("words");
    const onActivate = vi.fn();
    const getDecorations = vi.fn(() => [
      { start: 0, end: 2, key: "ab", appearance: "reference" as const },
    ]);
    const provider = { sources: ["article"] as const, getDecorations, onActivate };
    try {
      const decorations = context.textDecorations!;
      await expect(
        decorations.register({ ...provider, sources: ["card", "article"] })
      ).rejects.toThrow();
      const handle = await decorations.register(provider);
      const input = {
        text: "abcd",
        source: { kind: "article" as const, id: "7" },
        blockType: "paragraph",
      };
      const controller = new AbortController();
      const unsubscribe = registry.subscribe(input.source, () => controller.abort());
      await expect(
        registry.resolve({ ...input, source: { kind: "card", id: "7" } }, controller.signal)
      ).resolves.toEqual([]);
      expect(getDecorations).not.toHaveBeenCalled();
      const [first] = await registry.resolve(input, controller.signal);
      handle.invalidate({ source: { kind: "article", id: "8" } });
      await first.activate?.();
      expect(onActivate).toHaveBeenCalledWith({ key: "ab", source: input.source });
      handle.invalidate({ source: input.source });
      expect(controller.signal.aborted).toBe(true);
      await first.activate?.();
      unsubscribe();
      const signal = new AbortController().signal;
      const [second] = await registry.resolve(input, signal);
      allowed = false;
      await expect(registry.resolve(input, signal)).resolves.toEqual([]);
      await second.activate?.();
      allowed = true;
      await host.dispose();
      await second.activate?.();
      expect(onActivate).toHaveBeenCalledTimes(1);
    } finally {
      await host.dispose();
    }
  });

  it("悬停候选才读取目标，目标撤权或异步结果过期时丢弃预览", async () => {
    let granted = false;
    let settle!: () => void;
    const data = {
      get: vi.fn(async () => {
        await new Promise<void>(resolve => {
          settle = resolve;
        });
        return { title: "目标", contentRef: "body" };
      }),
      readContent: vi.fn(async () => ({
        owners: ["card" as const],
        own: false,
        snapshot: { nodes: [], updatedAt: 0, wordCount: 0, revision: "1", ref: "body" },
      })),
    };
    const registry = new DesktopTextDecorations(
      {
        rowState: (_id, permission) =>
          permission === "articles:read" || granted ? "once" : "none",
        subscribe: () => () => {},
      },
      data
    );
    const host = new PluginHost({
      workspaceId: "one",
      storage: createMemoryStorage(),
      textDecorations: registry,
      permissions: {
        ensure: async () => {},
        request: async () => granted,
        query: async (_ctx, permission) =>
          permission === "articles:read" || granted ? "granted" : "denied",
      },
    });
    const getPreview = vi.fn(async () => ({ ref: { kind: "card" as const, id: "7" } }));
    host.registerTrusted({
      ...definePlugin({
        id: "reader",
        name: "reader",
        version: "1",
        create: () => ({
          async activate(ctx) {
            await ctx.textDecorations!.register({
              sources: ["article"],
              getDecorations: () => [{ start: 0, end: 2, appearance: "marker", key: "term" }],
              getPreview,
            });
          },
        }),
      }),
      permissions: ["articles:read", "cards:read"],
    });
    await host.enable("reader");
    const source = { kind: "article" as const, id: "1" };
    const [hit] = await registry.resolve(
      { source, text: "词条", blockType: "paragraph" },
      new AbortController().signal
    );
    expect(getPreview).not.toHaveBeenCalled();
    const controller = new AbortController();
    await expect(hit.preview!("candidate", controller.signal)).resolves.toBeUndefined();
    expect(data.get).not.toHaveBeenCalled();
    granted = true;
    const pending = hit.preview!("candidate", controller.signal);
    await vi.waitFor(() => expect(data.get).toHaveBeenCalledTimes(1));
    expect(getPreview.mock.calls.at(-1)).toEqual([
      { key: "term", choice: "candidate", source },
      expect.anything(),
    ]);
    granted = false;
    settle();
    await expect(pending).resolves.toBeUndefined();
    expect(data.readContent).not.toHaveBeenCalled();
    granted = true;
    const stale = hit.preview!(undefined, controller.signal);
    await vi.waitFor(() => expect(data.get).toHaveBeenCalledTimes(2));
    controller.abort();
    settle();
    await expect(stale).resolves.toBeUndefined();
    expect(data.readContent).not.toHaveBeenCalled();
    await host.dispose();
  });

  it("第一版外观名继续可用，候选选择回传给插件", async () => {
    const registry = new DesktopTextDecorations({
      rowState: () => "once",
      subscribe: () => () => {},
    });
    const onActivate = vi.fn(({ choice }: { choice?: string }) =>
      choice
        ? undefined
        : [
            { key: "a", title: "甲" },
            { key: 7 as never, title: "坏" },
          ]
    );
    registry.register(
      { pluginId: "words", signal: new AbortController().signal } as PluginContext,
      {
        sources: ["article"],
        getDecorations: () => [
          // 旧插件包的返回值，类型上已不允许。
          { start: 0, end: 1, appearance: "link" as never, key: "x" },
          { start: 1, end: 2, appearance: "highlight" as never },
          { start: 2, end: 3, appearance: "reference" },
        ],
        onActivate,
      },
      { name: "词表" }
    );
    const source = { kind: "article" as const, id: "1" };
    const hits = await registry.resolve(
      { source, blockType: "paragraph", text: "abc" },
      new AbortController().signal
    );
    expect(hits.map(hit => hit.appearance)).toEqual(["reference", "marker"]);
    await expect(hits[0].activate?.()).resolves.toEqual([
      { key: "a", title: "甲", description: undefined },
    ]);
    await expect(hits[0].activate?.("a")).resolves.toBeUndefined();
    expect(onActivate).toHaveBeenLastCalledWith({ key: "x", source, choice: "a" });
  });
});
