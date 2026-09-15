import { describe, expect, it } from "vitest";
import {
  back,
  forward,
  initialState,
  lruEvict,
  popToTop,
  push,
  replace,
  activateExisting,
  current,
} from "../stackMachine";

function stackOf(...keys: string[]) {
  return keys.reduce((s, k) => push(s, k, {}), initialState());
}

describe("栈机基础", () => {
  it("push 入栈并清空 forward（浏览器语义）", () => {
    const s0 = stackOf("a", "b");
    const s1 = back(s0)!;
    expect(s1.forward).toHaveLength(1);
    const s2 = push(s1, "c", {});
    // 后退过再前进新方向：b 留在 forward 之外被丢弃（同浏览器地址栏输入新地址）
    expect(s2.back.map(e => e.key)).toEqual(["a", "c"]);
    expect(s2.forward).toHaveLength(0);
  });

  it("back 弹出到 forward；根页 back 返回 null", () => {
    const s0 = stackOf("a", "b");
    const s1 = back(s0)!;
    expect(s1.back.map(e => e.key)).toEqual(["a"]);
    expect(s1.forward.map(e => e.key)).toEqual(["b"]);
    expect(back(s1)).toBeNull();
    expect(back(initialState())).toBeNull();
  });

  it("forward 把最近弹出的条目压回栈顶", () => {
    const s1 = back(stackOf("a", "b", "c"))!; // back=[a,b] forward=[c]
    const s2 = back(s1)!; // back=[a] forward=[c,b]
    const s3 = forward(s2)!;
    expect(s3.back.map(e => e.key)).toEqual(["a", "b"]);
    expect(s3.forward.map(e => e.key)).toEqual(["c"]);
  });

  it("replace 只替换栈顶", () => {
    const s0 = stackOf("a", "b");
    const s1 = replace(s0, "c", {});
    expect(s1.back.map(e => e.key)).toEqual(["a", "c"]);
  });

  it("popToTop 只留栈底并清空 forward", () => {
    const s1 = back(stackOf("a", "b", "c"))!;
    const s2 = popToTop(s1);
    expect(s2.back.map(e => e.key)).toEqual(["a"]);
    expect(s2.forward).toHaveLength(0);
  });
});

describe("activateExisting 单实例去重", () => {
  it("未命中返回 null", () => {
    const s0 = stackOf("a", "b");
    expect(activateExisting(s0, e => e.key === "zzz", {})).toBeNull();
  });

  it("命中栈中条目：移到栈顶并清空 forward", () => {
    const s1 = back(stackOf("a", "b", "c"))!; // back=[a,b] forward=[c]
    const s2 = activateExisting(s1, e => e.key === "a", {})!;
    expect(s2.back.map(e => e.key)).toEqual(["b", "a"]);
    expect(s2.forward).toHaveLength(0);
  });

  it("命中栈顶且参数相同：返回原引用（派发即无操作，不产生假历史）", () => {
    const s0 = stackOf("a", "b");
    const hit = activateExisting(s0, e => e.key === "b", {});
    expect(hit).toBe(s0);
  });

  it("命中栈顶但参数不同：原位更新参数（replace 语义）", () => {
    const s0 = stackOf("a", "card-detail");
    const s0TopId = current(s0)!.id;
    const s1 = activateExisting(s0, e => e.key === "card-detail", { cardId: 42 })!;
    // 实例身份不变（保活不中断），参数被替换
    expect(s1.back).toHaveLength(2);
    expect(s1.back[1].id).toBe(s0TopId);
    expect(s1.back[1].params).toEqual({ cardId: 42 });
  });
});

describe("LRU 驱逐候选", () => {
  it("未超上限返回空；超限按最久未访问返回多余条目且不含当前页", () => {
    const s0 = stackOf(...Array.from({ length: 14 }, (_, i) => `k${i}`));
    const evict = lruEvict(s0, 12);
    expect(evict).toHaveLength(2);
    // 最久未访问的是栈底两个（k0、k1），当前页 k13 不在其中
    expect(evict.map(e => e.key)).toEqual(["k0", "k1"]);
    expect(lruEvict(stackOf("a", "b"), 12)).toEqual([]);
  });
});
