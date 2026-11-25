import { describe, expect, it } from "vitest";
import { fitRailPins } from "../railFit";

// 一格 48、格距 10：n 格需要 58n - 10 的高度
const heightFor = (slots: number) => 58 * slots - 10;

describe("fitRailPins", () => {
  it("高度刚好放下全部时不出现「更多」", () => {
    expect(fitRailPins(heightFor(5), 5)).toEqual({ count: 5, more: false });
  });

  it("差一格放不下时最后一格让给「更多」", () => {
    expect(fitRailPins(heightFor(5) - 1, 5)).toEqual({ count: 3, more: true });
  });

  it("只够一格时只露出「更多」", () => {
    expect(fitRailPins(heightFor(1), 5)).toEqual({ count: 0, more: true });
  });

  it("连一格都放不下时整段收起", () => {
    expect(fitRailPins(heightFor(1) - 1, 5)).toEqual({ count: 0, more: false });
  });

  it("没有入口时什么都不放", () => {
    expect(fitRailPins(600, 0)).toEqual({ count: 0, more: false });
  });
});
