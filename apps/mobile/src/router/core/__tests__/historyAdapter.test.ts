import { beforeEach, describe, expect, it } from "vitest";
import { registerPageMeta, clearPageMetasForTest } from "../pageMeta";
import { number } from "../paramsSchema";
import { readHistoryState, restoreStack, toHistoryState } from "../historyAdapter";
import { createEmptyStack, createStack, type RouteEntry } from "../stackMachine";

function registerTestPages(): void {
  registerPageMeta({
    key: "home",
    layer: "screen",
    match: "single",
    keepAlive: "keep",
    transition: { preset: "none", enterMs: 0, exitMs: 0 },
    paramsSchema: {},
  });
  registerPageMeta({
    key: "todoDetail",
    layer: "screen",
    match: "multi",
    keepAlive: "keep",
    transition: { preset: "slideRight", enterMs: 300, exitMs: 250 },
    paramsSchema: { todoId: number() },
  });
  registerPageMeta({
    key: "cardPreview",
    layer: "overlay",
    match: "single",
    keepAlive: "keep",
    transition: { preset: "sheetUp", enterMs: 300, exitMs: 250 },
    paramsSchema: { cardId: number() },
  });
}

function entryOf(
  id: string,
  key: string,
  params: Record<string, unknown>,
  now: number
): RouteEntry {
  return { id, key, params, createdAt: now, lastActiveAt: now };
}

describe("router/core/historyAdapter", () => {
  beforeEach(() => {
    clearPageMetasForTest();
    registerTestPages();
  });

  it("toHistoryState/readHistoryState 往返一致", () => {
    const state = toHistoryState(
      createStack([entryOf("h1", "home", {}, 1), entryOf("t1", "todoDetail", { todoId: 7 }, 2)]),
      createStack([entryOf("p1", "cardPreview", { cardId: 9 }, 3)])
    );
    expect(readHistoryState(state)).toEqual(state);
    expect(readHistoryState(null)).toBeNull();
    expect(readHistoryState({ mark: "__tau_mobile_navigation__", version: 1 })).toBeNull();
  });

  it("restoreStack 按位置对齐保留 entry id", () => {
    const current = createStack([
      entryOf("h1", "home", {}, 1),
      entryOf("t1", "todoDetail", { todoId: 7 }, 2),
    ]);
    const restored = restoreStack(
      [
        { key: "home", params: {} },
        { key: "todoDetail", params: { todoId: 7 } },
      ],
      current,
      "screen",
      100
    );
    expect(restored.entries.map(e => e.id)).toEqual(["h1", "t1"]);
  });

  it("restoreStack 丢弃非法条目（必填缺失/层级不符）", () => {
    const current = createEmptyStack();
    const restored = restoreStack(
      [
        { key: "home", params: {} },
        { key: "todoDetail", params: { todoId: "bad" } },
        { key: "cardPreview", params: { cardId: 1 } },
        { key: "unknown-page", params: {} },
      ],
      current,
      "screen",
      100
    );
    expect(restored.entries.map(e => e.key)).toEqual(["home"]);
  });

  it("restoreStack 净化 params 中多余字段", () => {
    const restored = restoreStack(
      [{ key: "todoDetail", params: { todoId: 3, evil: "x" } }],
      createEmptyStack(),
      "screen",
      100
    );
    expect(restored.entries[0]?.params).toEqual({ todoId: 3 });
  });
});
