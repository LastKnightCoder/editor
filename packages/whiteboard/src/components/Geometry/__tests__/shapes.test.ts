import { describe, expect, it } from "vitest";

import { geometryItems } from "../../Toolbar/Geometry/config";
import { sizedShapePaths } from "../sizedShapes";
import { flattenPath } from "../../../utils/sketch/geometry";

const bounds = (paths: string[]) => {
  const points = paths.flatMap(d => flattenPath(d).flatMap(line => line.points));
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
};

const expectFills = (paths: string[], width: number, height: number) => {
  const box = bounds(paths);
  expect(box.minX).toBeCloseTo(0, 2);
  expect(box.minY).toBeCloseTo(0, 2);
  expect(box.maxX).toBeCloseTo(width, 2);
  expect(box.maxY).toBeCloseTo(height, 2);
};

describe("几何形状配置", () => {
  it("geometryType 不重复", () => {
    const types = geometryItems.map(item => item.geometryType);
    expect(new Set(types).size).toBe(types.length);
  });

  it.each(geometryItems.map(item => [item.geometryType, item] as const))(
    "%s 的单位路径四边贴满 0~1",
    (_, item) => {
      expectFills(item.paths, 1, 1);
    }
  );

  it.each(Object.entries(sizedShapePaths))("%s 按实际尺寸贴满宽高", (_, build) => {
    for (const [width, height] of [
      [200, 80],
      [80, 200],
      [120, 120],
    ]) {
      expectFills(build(width, height), width, height);
    }
  });

  it("定尺形状都有对应的工具栏配置", () => {
    const types = new Set(geometryItems.map(item => item.geometryType));
    for (const type of Object.keys(sizedShapePaths)) expect(types.has(type)).toBe(true);
  });
});
