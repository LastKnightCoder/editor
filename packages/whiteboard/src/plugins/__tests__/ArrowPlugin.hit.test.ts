import { describe, expect, it, vi } from "vitest";

// Board.tsx 的导入链会拉到依赖 Electron bridge 的模块，在无 bridge 的 jsdom 环境下会抛错。

// ArrowPlugin 顶层会引入 ArrowElementComponent（拉入 @tau/editor 等重组件），
// 命中测试不需要渲染，直接 mock 掉以保持单测轻量。
vi.mock("../../components/ArrowElementComponent", () => ({
  default: () => null,
}));

import type Board from "../../Board";
import { ArrowElement, EArrowLineType, EMarkerType, Point, Selection } from "../../types";
import { ArrowUtil } from "../../utils";
import { ArrowPlugin } from "../ArrowPlugin";

const createArrow = (
  points: Point[],
  midPoint?: Point,
  overrides: Partial<ArrowElement> = {}
): ArrowElement => ({
  id: "arrow-1",
  type: "arrow",
  lineType: EArrowLineType.STRAIGHT,
  source: { marker: EMarkerType.None },
  target: { marker: EMarkerType.None },
  lineWidth: 2,
  points,
  ...(midPoint ? { midPoint } : {}),
  ...overrides,
});

const selectArea = (x1: number, y1: number, x2: number, y2: number): Selection["selectArea"] => ({
  anchor: { x: x1, y: y1 },
  focus: { x: x2, y: y2 },
});

const plugin = new ArrowPlugin();
const stubBoard = {} as unknown as Board;

describe("ArrowUtil.getQuadraticControlPoint", () => {
  it("由 midPoint 反推二次贝塞尔控制点", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 100, y: 0 };
    const mid = { x: 50, y: 40 };

    const control = ArrowUtil.getQuadraticControlPoint(start, end, mid);

    // control = 2·mid − 0.5·(start + end) = (100,80) − (50,0) = (50,80)
    expect(control).toEqual({ x: 50, y: 80 });
  });

  it("使曲线在 t=0.5 处经过 midPoint", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 100, y: 0 };
    const mid = { x: 50, y: 40 };
    const control = ArrowUtil.getQuadraticControlPoint(start, end, mid);

    // B(0.5) = 0.25·start + 0.5·control + 0.25·end
    const t = 0.5;
    const pointAtHalf = {
      x: (1 - t) ** 2 * start.x + 2 * (1 - t) * t * control.x + t ** 2 * end.x,
      y: (1 - t) ** 2 * start.y + 2 * (1 - t) * t * control.y + t ** 2 * end.y,
    };

    expect(pointAtHalf).toEqual(mid);
  });
});

describe("ArrowPlugin.getBounds", () => {
  it("无 midPoint 时包围盒仅由端点构成", () => {
    const arrow = createArrow([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);

    expect(plugin.getBounds(stubBoard, arrow)).toEqual({
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 0,
    });
  });

  it("midPoint 在两端点连线上时不膨胀包围盒", () => {
    const arrow = createArrow(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      { x: 50, y: 0 }
    );

    expect(plugin.getBounds(stubBoard, arrow)).toEqual({
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 0,
    });
  });

  it("midPoint 偏离连线时包围盒包含贝塞尔控制点以覆盖弓背", () => {
    // start=(0,0), end=(100,0), midPoint=(50,40) → 控制点=(50,80)
    // 曲线弓背最远点在 t=0.5 处，即 (50,40)；包围盒需覆盖该点
    const arrow = createArrow(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      { x: 50, y: 40 }
    );

    const bounds = plugin.getBounds(stubBoard, arrow);

    // 包围盒必须包含控制点 (50,80)（曲线必落在凸包内）
    expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 80 });

    // 弓背最远点 (50,40) 必须落入包围盒，否则空间索引预筛选会将其过滤
    expect(50 >= bounds.minX && 50 <= bounds.maxX && 40 >= bounds.minY && 40 <= bounds.maxY).toBe(
      true
    );
  });
});

describe("ArrowPlugin.isElementSelected", () => {
  it("框选罩住弓背但不含端点时应选中弯曲箭头", () => {
    // 端点在 y=0，弓背向下凸到 y=40；框选只覆盖弓背区域
    const arrow = createArrow(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      { x: 50, y: 40 }
    );

    const result = plugin.isElementSelected(stubBoard, arrow, selectArea(30, 20, 70, 50));

    expect(result).toBe(true);
  });

  it("框选与箭头完全不相交时不选中", () => {
    const arrow = createArrow(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      { x: 50, y: 40 }
    );

    const result = plugin.isElementSelected(stubBoard, arrow, selectArea(200, 200, 300, 300));

    expect(result).toBe(false);
  });

  it("直线箭头框选罩住中段时仍可选中（回归保护）", () => {
    // midPoint 在连线上，不应改变原有框选行为
    const arrow = createArrow(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      { x: 50, y: 0 }
    );

    const result = plugin.isElementSelected(stubBoard, arrow, selectArea(30, -5, 70, 5));

    expect(result).toBe(true);
  });
});
