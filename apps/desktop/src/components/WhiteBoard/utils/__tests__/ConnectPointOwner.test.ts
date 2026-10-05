import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createConnectPointOwnerStore,
  resolveConnectPointOwner,
  type ConnectPointCandidate,
} from "../ConnectPointOwner";

const RADIUS = 28;

const box = (
  x: number,
  y: number,
  width: number,
  height: number,
  container = false
): ConnectPointCandidate => ({ bounds: { x, y, width, height }, container });

// Frame(0,0,600,400) 内嵌矩形(100,100,300,150)
const frame = box(0, 0, 600, 400, true);
const inner = box(100, 100, 300, 150);
const nested: [string, ConnectPointCandidate][] = [
  ["frame", frame],
  ["inner", inner],
];

describe("resolveConnectPointOwner", () => {
  it("指针在内层元素上：只归内层，不归外层 Frame", () => {
    expect(resolveConnectPointOwner(nested, { x: 250, y: 175 }, RADIUS)).toBe("inner");
  });

  it("指针在内层元素外扩区、Frame 内部空白：都不在边框带内则无归属", () => {
    expect(resolveConnectPointOwner(nested, { x: 250, y: 270 }, RADIUS)).toBe("inner");
    expect(resolveConnectPointOwner(nested, { x: 500, y: 330 }, RADIUS)).toBeNull();
  });

  it("Frame 只在靠近边框（内外两侧）时归属", () => {
    expect(resolveConnectPointOwner(nested, { x: 10, y: 200 }, RADIUS)).toBe("frame");
    expect(resolveConnectPointOwner(nested, { x: -20, y: 200 }, RADIUS)).toBe("frame");
    expect(resolveConnectPointOwner(nested, { x: 300, y: 380 }, RADIUS)).toBe("frame");
  });

  it("指针在某元素内部，优先于只落在另一元素外扩区", () => {
    const candidates: [string, ConnectPointCandidate][] = [
      ["big", box(0, 0, 200, 200)],
      ["small", box(210, 0, 20, 20)],
    ];
    expect(resolveConnectPointOwner(candidates, { x: 195, y: 10 }, RADIUS)).toBe("big");
  });

  it("都在外扩区时取距离最近的", () => {
    const candidates: [string, ConnectPointCandidate][] = [
      ["left", box(0, 0, 100, 100)],
      ["right", box(130, 0, 100, 100)],
    ];
    expect(resolveConnectPointOwner(candidates, { x: 110, y: 50 }, RADIUS)).toBe("left");
    expect(resolveConnectPointOwner(candidates, { x: 122, y: 50 }, RADIUS)).toBe("right");
  });

  it("超出感应半径或无指针时无归属", () => {
    expect(
      resolveConnectPointOwner([["a", box(0, 0, 100, 100)]], { x: 140, y: 50 }, RADIUS)
    ).toBeNull();
    expect(resolveConnectPointOwner([["a", box(0, 0, 100, 100)]], null, RADIUS)).toBeNull();
  });
});

describe("createConnectPointOwnerStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = async () => {
    const store = createConnectPointOwnerStore({ radius: RADIUS, hideDelay: 80 });
    store.register("frame", frame);
    store.register("inner", inner);
    await Promise.resolve();
    return store;
  };

  it("归属切换到另一元素时立即生效，变为空时延迟清空", async () => {
    const store = await setup();
    store.setPointer({ x: 250, y: 175 });
    expect(store.getOwner()).toBe("inner");

    store.setPointer({ x: 10, y: 200 });
    expect(store.getOwner()).toBe("frame");

    store.setPointer({ x: 500, y: 330 });
    expect(store.getOwner()).toBe("frame");
    vi.advanceTimersByTime(80);
    expect(store.getOwner()).toBeNull();
  });

  it("延迟期间重新进入感应区不会闪烁", async () => {
    const store = await setup();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setPointer({ x: 250, y: 175 });
    store.setPointer({ x: 500, y: 330 });
    store.setPointer({ x: 250, y: 175 });
    vi.advanceTimersByTime(200);
    expect(store.getOwner()).toBe("inner");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("锁定后不被邻近元素抢走，解锁后恢复仲裁", async () => {
    const store = await setup();
    store.setPointer({ x: 10, y: 200 });
    store.lock("frame");
    store.setPointer({ x: 250, y: 175 });
    expect(store.getOwner()).toBe("frame");

    store.unlock("frame");
    expect(store.getOwner()).toBe("inner");
  });

  it("注销后不再参与仲裁", async () => {
    const store = await setup();
    const unregister = store.register("inner", inner);
    await Promise.resolve();
    store.setPointer({ x: 250, y: 175 });
    expect(store.getOwner()).toBe("inner");

    unregister();
    await Promise.resolve();
    vi.advanceTimersByTime(80);
    expect(store.getOwner()).toBeNull();
  });

  it("resolveAt：拖动落点按给定半径即时求值，与悬停同一套规则", async () => {
    const store = await setup();
    const DROP = 10;
    // 内层矩形内部（含其中心）→ 内层
    expect(store.resolveAt({ x: 250, y: 175 }, DROP)).toBe("inner");
    // 内层外 20：超出落点半径；Frame 内部空白 → 无目标
    expect(store.resolveAt({ x: 250, y: 270 }, DROP)).toBeNull();
    // Frame 边框带
    expect(store.resolveAt({ x: 5, y: 200 }, DROP)).toBe("frame");
    expect(store.resolveAt({ x: 20, y: 200 }, DROP)).toBeNull();
    // 不影响悬停归属
    expect(store.getOwner()).toBeNull();
  });

  it("resolveAt：候选变化后不使用旧缓存", async () => {
    const store = await setup();
    const point = { x: 250, y: 175 };
    expect(store.resolveAt(point, 10)).toBe("inner");
    const unregister = store.register("inner", inner);
    unregister();
    expect(store.resolveAt(point, 10)).toBeNull();
  });
});
