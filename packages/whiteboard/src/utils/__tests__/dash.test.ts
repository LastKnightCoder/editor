import { describe, expect, it } from "vitest";

import { fitDash, roundedRectPerimeter, roundedRectSides } from "../dash";

describe("roundedRectSides", () => {
  it("常规圆角矩形返回四条边，长度之和等于周长", () => {
    const sides = roundedRectSides(300, 200, 8);
    expect(sides).toHaveLength(4);
    const total = sides.reduce((sum, side) => sum + side.length, 0);
    expect(total).toBeCloseTo(roundedRectPerimeter(300, 200, 8), 6);
  });

  it("上边长度为直段加两段四分之一圆弧", () => {
    const [top] = roundedRectSides(300, 200, 8);
    expect(top.length).toBeCloseTo(300 - 16 + 4 * Math.PI, 6);
    expect(top.d.startsWith("M2.34 2.34")).toBe(true);
    expect(top.d).toContain("A8 8 0 0 1");
  });

  it("半径超出短边一半时被钳制", () => {
    const sides = roundedRectSides(100, 20, 50);
    // 半径钳到 10，右边直段为 0，只剩两段四分之一圆弧
    expect(sides[1].length).toBeCloseTo(5 * Math.PI, 6);
  });

  it("半径 0 时退化为直线段", () => {
    const sides = roundedRectSides(300, 200, 0);
    for (const side of sides) {
      expect(side.d).not.toContain("A");
    }
    expect(sides[0].length).toBe(300);
    expect(sides[1].length).toBe(200);
  });
});

describe("fitDash", () => {
  it("按整数个周期贴合长度，dash 与 gap 拼回周期", () => {
    const length = 301;
    const fit = fitDash(length, { visible: 8, pitch: 14 }, 2);
    expect(Number.isInteger(fit.count)).toBe(true);
    expect(fit.count).toBeGreaterThanOrEqual(1);
    expect(fit.count * fit.pitch).toBeCloseTo(length, 6);
    expect(fit.dash + fit.gap).toBeCloseTo(fit.pitch, 6);
  });

  it("点线节奏可见长度为 0，整段周期都是空隙", () => {
    const fit = fitDash(100, { visible: 0, pitch: 5 }, 2);
    expect(fit.dash).toBe(0);
    expect(fit.gap).toBe(fit.pitch);
  });

  it("长度或周期非正时返回全 0", () => {
    const allZero = { dash: 0, gap: 0, pitch: 0, count: 0 };
    expect(fitDash(0, { visible: 8, pitch: 14 }, 2)).toEqual(allZero);
    expect(fitDash(100, { visible: 8, pitch: 0 }, 2)).toEqual(allZero);
  });
});
