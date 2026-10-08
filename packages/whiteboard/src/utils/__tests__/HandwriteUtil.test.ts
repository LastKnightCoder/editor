import { describe, expect, it } from "vitest";
import {
  buildStrokeOutline,
  getDefaultHandwriteStyle,
  normalizePoints,
  denormalizePoints,
  outlineToSvgPath,
  rebuildHandwriteGeometry,
} from "../HandwriteUtil";

describe("HandwriteUtil", () => {
  it("should return default handwrite style", () => {
    const style = getDefaultHandwriteStyle();
    expect(style.size).toBe(8);
    expect(style.opacity).toBe(1);
    expect(style.simulatePressure).toBe(true);
  });

  it("should normalize and denormalize points", () => {
    const points = [
      { x: 100, y: 200, pressure: 0.4 },
      { x: 180, y: 260, pressure: 0.8 },
    ];
    const bounds = {
      x: 100,
      y: 200,
      width: 80,
      height: 60,
    };

    const normalized = normalizePoints(points, bounds);
    const denormalized = denormalizePoints(normalized, bounds);

    expect(denormalized[0].x).toBeCloseTo(points[0].x, 6);
    expect(denormalized[0].y).toBeCloseTo(points[0].y, 6);
    expect(denormalized[1].x).toBeCloseTo(points[1].x, 6);
    expect(denormalized[1].y).toBeCloseTo(points[1].y, 6);
  });

  it("should build outline path from points", () => {
    const style = getDefaultHandwriteStyle();
    const outline = buildStrokeOutline(
      [
        { x: 10, y: 10, pressure: 0.5 },
        { x: 20, y: 15, pressure: 0.6 },
        { x: 30, y: 20, pressure: 0.7 },
      ],
      style
    );

    expect(outline.length).toBeGreaterThan(0);
    const path = outlineToSvgPath(outline);
    expect(path.startsWith("M")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
  });

  it("should rebuild geometry after style change", () => {
    const style = getDefaultHandwriteStyle();
    const rebuilt = rebuildHandwriteGeometry(
      [
        { x: 0.1, y: 0.2, pressure: 0.4 },
        { x: 0.5, y: 0.4, pressure: 0.5 },
        { x: 0.9, y: 0.8, pressure: 0.6 },
      ],
      {
        x: 100,
        y: 120,
        width: 200,
        height: 180,
      },
      {
        ...style,
        size: 12,
      }
    );

    expect(rebuilt).not.toBeNull();
    expect(rebuilt?.points.length).toBe(3);
    expect((rebuilt?.outline.length || 0) > 0).toBe(true);
  });
});
