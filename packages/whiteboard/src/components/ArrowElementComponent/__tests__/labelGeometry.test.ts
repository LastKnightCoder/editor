import { describe, expect, it } from "vitest";
import {
  getFallbackLabelAnchor,
  normalizeReadableAngle,
  offsetAnchorAlongNormal,
} from "../labelGeometry";

describe("labelGeometry", () => {
  it("normalizeReadableAngle 应将倒置角度转为可读角度", () => {
    expect(normalizeReadableAngle(170)).toBe(-10);
    expect(normalizeReadableAngle(-170)).toBe(10);
    expect(normalizeReadableAngle(45)).toBe(45);
  });

  it("getFallbackLabelAnchor 应返回路径中点及切线角度", () => {
    const anchor = getFallbackLabelAnchor([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);

    expect(anchor).not.toBeNull();
    expect(anchor?.x).toBe(50);
    expect(anchor?.y).toBe(0);
    expect(anchor?.angle).toBe(0);
  });

  it("折线中点落在中段时应按该段角度计算", () => {
    const anchor = getFallbackLabelAnchor([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 80 },
    ]);

    expect(anchor).not.toBeNull();
    expect(anchor?.x).toBe(40);
    expect(anchor?.y).toBe(20);
    expect(anchor?.angle).toBe(90);
  });

  it("offsetAnchorAlongNormal 在 offset 为 0 时返回原锚点", () => {
    const anchor = { x: 10, y: 20, angle: 30 };
    expect(offsetAnchorAlongNormal(anchor, 0)).toEqual(anchor);
  });

  it("offsetAnchorAlongNormal 水平线(angle=0)应向屏幕上方偏移", () => {
    const anchor = { x: 50, y: 0, angle: 0 };
    const result = offsetAnchorAlongNormal(anchor, 10);
    expect(result.x).toBeCloseTo(50);
    expect(result.y).toBeCloseTo(-10);
    expect(result.angle).toBe(0);
  });

  it("offsetAnchorAlongNormal 垂直向下线(angle=90)应向屏幕右侧偏移", () => {
    const anchor = { x: 0, y: 50, angle: 90 };
    const result = offsetAnchorAlongNormal(anchor, 10);
    expect(result.x).toBeCloseTo(10);
    expect(result.y).toBeCloseTo(50);
    expect(result.angle).toBe(90);
  });

  it("offsetAnchorAlongNormal 垂直向上线(angle=-90)应向屏幕左侧偏移", () => {
    const anchor = { x: 0, y: 50, angle: -90 };
    const result = offsetAnchorAlongNormal(anchor, 10);
    expect(result.x).toBeCloseTo(-10);
    expect(result.y).toBeCloseTo(50);
    expect(result.angle).toBe(-90);
  });

  it("offsetAnchorAlongNormal 应保留原角度", () => {
    const anchor = { x: 0, y: 0, angle: 45 };
    const result = offsetAnchorAlongNormal(anchor, 15);
    expect(result.angle).toBe(45);
  });
});
