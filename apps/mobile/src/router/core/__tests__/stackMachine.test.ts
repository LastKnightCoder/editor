import { beforeEach, describe, expect, it } from "vitest";
import { registerPageMeta, clearPageMetasForTest } from "../pageMeta";
import { number, optional } from "../paramsSchema";
import {
  createEmptyStack,
  createStack,
  getTopEntry,
  popEntry,
  popToKey,
  popToTop,
  pushEntry,
  removeEntryById,
  replaceTop,
  collectKeepAliveEvictionCandidates,
  type RouteEntry,
} from "../stackMachine";

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
    key: "settings",
    layer: "screen",
    match: "single",
    keepAlive: "keep",
    transition: { preset: "slideRight", enterMs: 300, exitMs: 250 },
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
    key: "contentDetail",
    layer: "screen",
    match: "params",
    getId: p => String(p.contentId),
    keepAlive: "keep",
    transition: { preset: "slideRight", enterMs: 300, exitMs: 250 },
    paramsSchema: { contentId: number(), refId: optional(number()) },
  });
  registerPageMeta({
    key: "cardPicker",
    layer: "overlay",
    match: "single",
    keepAlive: "keep",
    transition: { preset: "sheetUp", enterMs: 300, exitMs: 250 },
    paramsSchema: {},
  });
}

function spec(key: string, params: Record<string, unknown>, id: string, now: number) {
  return { key, params, id, now };
}

function entryOf(
  id: string,
  key: string,
  params: Record<string, unknown>,
  now: number
): RouteEntry {
  return { id, key, params, createdAt: now, lastActiveAt: now };
}

describe("router/core/stackMachine", () => {
  beforeEach(() => {
    clearPageMetasForTest();
    registerTestPages();
  });

  it("match:single 重复 push 应复用实例并移到栈顶", () => {
    let stack = createEmptyStack();
    stack = pushEntry(stack, spec("home", {}, "h1", 1));
    stack = pushEntry(stack, spec("settings", {}, "s1", 2));
    stack = pushEntry(stack, spec("home", {}, "h2", 3));
    stack = pushEntry(stack, spec("settings", {}, "s2", 4));

    expect(stack.entries.map(e => e.key)).toEqual(["home", "settings"]);
    expect(stack.entries[1].id).toBe("s2");
  });

  it("match:params 同身份复用、不同身份新建", () => {
    let stack = createEmptyStack();
    stack = pushEntry(stack, spec("home", {}, "h1", 1));
    stack = pushEntry(stack, spec("contentDetail", { contentId: 1 }, "c1", 2));
    stack = pushEntry(stack, spec("contentDetail", { contentId: 2 }, "c2", 3));
    expect(stack.entries).toHaveLength(3);

    stack = pushEntry(stack, spec("contentDetail", { contentId: 1 }, "c3", 4));
    expect(stack.entries.map(e => e.params.contentId)).toEqual([undefined, 2, 1]);
    expect(getTopEntry(stack)?.id).toBe("c3");
  });

  it("match:multi 每次都新建实例", () => {
    let stack = createEmptyStack();
    stack = pushEntry(stack, spec("todoDetail", { todoId: 1 }, "t1", 1));
    stack = pushEntry(stack, spec("todoDetail", { todoId: 1 }, "t2", 2));
    expect(stack.entries).toHaveLength(2);
    expect(stack.entries.map(e => e.id)).toEqual(["t1", "t2"]);
  });

  it("pop 返回被弹出的栈顶并更新新栈顶的 lastActiveAt", () => {
    const stack = createStack([entryOf("h1", "home", {}, 1), entryOf("s1", "settings", {}, 2)]);
    const result = popEntry(stack, 10);
    expect(result.popped?.id).toBe("s1");
    expect(result.stack.entries).toHaveLength(1);
    expect(result.stack.entries[0].lastActiveAt).toBe(10);
  });

  it("replaceTop 替换栈顶为新实例", () => {
    let stack = createStack([
      entryOf("h1", "home", {}, 1),
      entryOf("t1", "todoDetail", { todoId: 1 }, 2),
    ]);
    stack = replaceTop(stack, spec("todoDetail", { todoId: 9 }, "t2", 3));
    expect(stack.entries).toHaveLength(2);
    expect(getTopEntry(stack)?.id).toBe("t2");
    expect(getTopEntry(stack)?.params.todoId).toBe(9);
  });

  it("popToKey 弹到最近的指定页面（含），已是栈顶则不动作", () => {
    const stack = createStack([
      entryOf("h1", "home", {}, 1),
      entryOf("s1", "settings", {}, 2),
      entryOf("t1", "todoDetail", { todoId: 1 }, 3),
    ]);
    const popped = popToKey(stack, "home", 9);
    expect(popped.entries.map(e => e.key)).toEqual(["home"]);

    const noOp = popToKey(popped, "home", 10);
    expect(noOp.entries.map(e => e.key)).toEqual(["home"]);
  });

  it("popToTop 只留根页", () => {
    const stack = createStack([
      entryOf("h1", "home", {}, 1),
      entryOf("s1", "settings", {}, 2),
      entryOf("t1", "todoDetail", { todoId: 1 }, 3),
    ]);
    expect(popToTop(stack, 9).entries.map(e => e.key)).toEqual(["home"]);
  });

  it("removeEntryById 移除中间实例", () => {
    const stack = createStack([
      entryOf("h1", "home", {}, 1),
      entryOf("s1", "settings", {}, 2),
      entryOf("t1", "todoDetail", { todoId: 1 }, 3),
    ]);
    const next = removeEntryById(stack, "s1", 9);
    expect(next.entries.map(e => e.id)).toEqual(["h1", "t1"]);
  });

  it("LRU 候选按 lastActiveAt 升序且排除保护区", () => {
    const stack = createStack([
      { ...entryOf("h1", "home", {}, 1), lastActiveAt: 1 },
      { ...entryOf("s1", "settings", {}, 2), lastActiveAt: 100 },
      { ...entryOf("t1", "todoDetail", { todoId: 1 }, 3), lastActiveAt: 50 },
      { ...entryOf("t2", "todoDetail", { todoId: 2 }, 4), lastActiveAt: 80 },
    ]);
    const candidates = collectKeepAliveEvictionCandidates(stack, () => true, new Set(["t2"]), 10);
    // 栈顶 t2 在保护区；其余按最久未访问排序：h1(1) → t1(50) → s1(100)
    expect(candidates).toEqual(["h1", "t1", "s1"]);
  });
});

describe("router/core/stackMachine 审查修复", () => {
  beforeEach(() => {
    clearPageMetasForTest();
    registerTestPages();
  });

  it("D-6: single overlay 重复 push 后 createdAt 必须刷新（可见性不变式）", () => {
    let stack = createEmptyStack();
    stack = pushEntry(stack, spec("home", {}, "h1", 1));
    stack = pushEntry(stack, spec("cardPicker", { cardId: 1 }, "o1", 2));
    // 复用（single）移到顶：createdAt 应更新为本次时间
    stack = pushEntry(stack, spec("cardPicker", { cardId: 2 }, "o2", 10));
    const top = getTopEntry(stack);
    expect(top?.id).toBe("o2");
    expect(top?.createdAt).toBe(10);
    expect(stack.entries).toHaveLength(2);
  });
});
