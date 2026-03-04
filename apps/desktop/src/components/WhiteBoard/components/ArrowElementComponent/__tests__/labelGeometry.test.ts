import { describe, expect, it } from "vitest";
import {
  getFallbackLabelAnchor,
  normalizeReadableAngle,
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
});
