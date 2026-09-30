import { describe, expect, it } from "vitest";
import { resolveMediaShortcut, stepPlaybackRate } from "../mediaShortcuts";

const key = (
  k: string,
  mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "isComposing", boolean>> = {}
) =>
  resolveMediaShortcut({
    key: k,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    isComposing: false,
    ...mods,
  });

describe("resolveMediaShortcut", () => {
  it("空格与 K 切换播放", () => {
    expect(key(" ")).toEqual({ type: "togglePlay" });
    expect(key("k")).toEqual({ type: "togglePlay" });
    expect(key("K")).toEqual({ type: "togglePlay" });
  });

  it("方向键 ±5 秒，J/L ±10 秒", () => {
    expect(key("ArrowLeft")).toEqual({ type: "seekBy", seconds: -5 });
    expect(key("ArrowRight")).toEqual({ type: "seekBy", seconds: 5 });
    expect(key("j")).toEqual({ type: "seekBy", seconds: -10 });
    expect(key("L")).toEqual({ type: "seekBy", seconds: 10 });
  });

  it("上下键调音量，数字键按十分位跳转", () => {
    expect(key("ArrowUp")).toEqual({ type: "volumeBy", delta: 0.1 });
    expect(key("ArrowDown")).toEqual({ type: "volumeBy", delta: -0.1 });
    expect(key("0")).toEqual({ type: "seekToFraction", fraction: 0 });
    expect(key("7")).toEqual({ type: "seekToFraction", fraction: 0.7 });
  });

  it("< > 调速，, . 逐帧", () => {
    expect(key(">")).toEqual({ type: "rateStep", step: 1 });
    expect(key("<")).toEqual({ type: "rateStep", step: -1 });
    expect(key(".")).toEqual({ type: "frameStep", direction: 1 });
    expect(key(",")).toEqual({ type: "frameStep", direction: -1 });
  });

  it("带 ⌘ / Ctrl / Alt 的组合键与输入法组合放行", () => {
    expect(key("ArrowLeft", { altKey: true })).toBeNull();
    expect(key("k", { metaKey: true })).toBeNull();
    expect(key("f", { ctrlKey: true })).toBeNull();
    expect(key("m", { isComposing: true })).toBeNull();
  });

  it("未定义的按键返回 null", () => {
    expect(key("a")).toBeNull();
    expect(key("Enter")).toBeNull();
    expect(key("Escape")).toBeNull();
  });
});

describe("stepPlaybackRate", () => {
  it("按档位步进，越界返回 null", () => {
    expect(stepPlaybackRate(1, 1)).toBe(1.25);
    expect(stepPlaybackRate(1, -1)).toBe(0.75);
    expect(stepPlaybackRate(2, 1)).toBeNull();
    expect(stepPlaybackRate(0.5, -1)).toBeNull();
  });

  it("非档位速率从最近的档位起步", () => {
    expect(stepPlaybackRate(1.1, 1)).toBe(1.25);
    expect(stepPlaybackRate(1.4, -1)).toBe(1.25);
  });
});
