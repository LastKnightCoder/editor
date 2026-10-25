import { expect, it } from "vitest";
import { assertPresenceBudget } from "./presence-budget";
import { WHITEBOARD_LIMITS } from "./model-limits";
it.each(["a", "汉", "😀"])("Presence %s 按 UTF-8 在边界接纳，超过一个字节拒绝", char => {
  const encoder = new TextEncoder(),
    overhead = encoder.encode(JSON.stringify([[1, { value: "" }]])).byteLength;
  const available = WHITEBOARD_LIMITS.presenceBytes - overhead,
    width = encoder.encode(char).byteLength;
  const value = char.repeat(Math.floor(available / width)) + "x".repeat(available % width);
  const states = new Map([[1, { value }]]);
  expect(encoder.encode(JSON.stringify([...states])).byteLength).toBe(
    WHITEBOARD_LIMITS.presenceBytes
  );
  expect(() => assertPresenceBudget(states)).not.toThrow();
  states.set(1, { value: value + "x" });
  expect(() => assertPresenceBudget(states)).toThrow("在线状态超过限制");
});
it("Presence 客户端数量与字节是独立限制", () => {
  const states = new Map(Array.from({ length: 16 }, (_, id) => [id, {}] as const));
  expect(() => assertPresenceBudget(states)).not.toThrow();
  states.set(16, {});
  expect(() => assertPresenceBudget(states)).toThrow("在线状态超过限制");
});
