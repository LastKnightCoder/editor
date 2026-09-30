import { describe, expect, it } from "vitest";
import {
  ADJUST_MAX,
  ADJUST_MIN,
  COLUMN_WIDTH,
  caretScrollDelta,
  columnWidth,
  fitZoom,
  stepAdjust,
} from "../layout";

describe("fitZoom", () => {
  it("随屏宽放大，小屏不缩、大屏封顶", () => {
    expect(fitZoom(1000)).toBe(1);
    expect(fitZoom(1440)).toBeCloseTo(1.2);
    expect(fitZoom(1920)).toBeCloseTo(1.6);
    expect(fitZoom(3840)).toBe(1.75);
  });
});

describe("columnWidth", () => {
  it("放得下用常规版心，窗口过窄按缩放折回逻辑宽度", () => {
    expect(columnWidth(1440, 1.2)).toBe(COLUMN_WIDTH);
    expect(columnWidth(664, 1)).toBe(600);
    expect(columnWidth(800, 1.5)).toBeCloseTo(736 / 1.5);
  });
});

describe("stepAdjust", () => {
  it("按 0.1 步进且无浮点误差，两端钳制", () => {
    expect(stepAdjust(1, 1)).toBe(1.1);
    expect(stepAdjust(1.1, -1)).toBe(1);
    expect(stepAdjust(ADJUST_MAX, 1)).toBe(ADJUST_MAX);
    expect(stepAdjust(ADJUST_MIN, -1)).toBe(ADJUST_MIN);
  });
});

describe("caretScrollDelta", () => {
  it("打字机：光标行拉回视线高度，微小偏移不动", () => {
    expect(caretScrollDelta(800, 1000, "typewriter")).toBe(350);
    expect(caretScrollDelta(100, 1000, "typewriter")).toBe(-350);
    expect(caretScrollDelta(452, 1000, "typewriter")).toBe(0);
  });

  it("舒适带：带内不动，越出上下沿各自回到偏中位置", () => {
    expect(caretScrollDelta(500, 1000, "comfort")).toBe(0);
    expect(caretScrollDelta(900, 1000, "comfort")).toBe(300);
    expect(caretScrollDelta(50, 1000, "comfort")).toBe(-250);
  });
});
