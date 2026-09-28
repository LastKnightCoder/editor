import { afterEach, describe, expect, it, vi } from "vitest";
import { requestReveal, subscribeReveal, takeReveal, trailStepParams } from "../navigation";

afterEach(() => {
  vi.useRealTimers();
  takeReveal(-1);
});

describe("白板跳转", () => {
  const trail = [
    { boardId: 1, pageId: 10, elementId: "e-a" },
    { boardId: 2, pageId: 20, elementId: "e-b" },
  ];

  it("回到某一级：定位到那一页，链截到它之前", () => {
    expect(trailStepParams(trail, 1)).toEqual({ id: 2, page: 20, trail: "1:10:e-a" });
    expect(trailStepParams(trail, 0)).toEqual({ id: 1, page: 10, trail: undefined });
  });

  it("定位请求只被目标页取走一次，并通知订阅者", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeReveal(listener);
    requestReveal(20, "e-b");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(takeReveal(10)).toBeNull();
    expect(takeReveal(20)).toBe("e-b");
    expect(takeReveal(20)).toBeNull();
    unsubscribe();
  });

  it("过期的定位请求作废", () => {
    vi.useFakeTimers();
    requestReveal(20, "e-b");
    vi.advanceTimersByTime(6000);
    expect(takeReveal(20)).toBeNull();
  });
});
