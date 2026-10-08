import { describe, expect, it } from "vitest";
import {
  snapMove,
  snapMoveToGrid,
  snapResize,
  snapResizeToGrid,
  unionBounds,
} from "../SnapGeometry";

const rect = (x: number, y: number, width = 100, height = 100) => ({ x, y, width, height });

describe("snapMove", () => {
  it("阈值内吸附到最近的边，只画吸附后真正对齐的线", () => {
    const { dx, dy, guides } = snapMove(rect(103, 500), [rect(0, 0)], 8);
    expect(dx).toBe(-3);
    expect(dy).toBe(0);
    // 左边吸到候选右边，只有这一处重合
    expect(guides.map(guide => guide.key)).toEqual(["x:100"]);
  });

  it("同宽元素左/中/右同时重合时各画一条竖线", () => {
    const { guides } = snapMove(rect(3, 500), [rect(0, 0)], 8);
    expect(guides.map(guide => guide.key).sort()).toEqual(["x:0", "x:100", "x:50"]);
    expect(guides.every(guide => guide.axis === "x")).toBe(true);
  });

  it("超过阈值不吸附也不画线", () => {
    const result = snapMove(rect(115, 500), [rect(0, 0)], 8);
    expect(result).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it("支持中心对齐", () => {
    // 运动元素中心 x = 52+20 = 72，候选中心 x = 70
    const { dx, guides } = snapMove(rect(52, 300, 40, 40), [rect(20, 0, 100, 50)], 8);
    expect(dx).toBe(-2);
    expect(guides.map(guide => guide.key)).toEqual(["x:70"]);
  });

  it("每轴只取最近的偏移", () => {
    const { dx } = snapMove(rect(204, 500), [rect(0, 0), rect(201, 900)], 8);
    // 左边 204 → 201 偏移 -3；右边 304 与候选不在阈值内；最终取 -3
    expect(dx).toBe(-3);
  });

  it("同一坐标上的多个候选合并为一条线，跨度覆盖全部对齐点", () => {
    const { guides } = snapMove(
      rect(2, 200, 50, 50),
      [rect(0, 0, 30, 30), rect(0, 500, 80, 20)],
      8
    );
    const left = guides.filter(guide => guide.key === "x:0");
    expect(left).toHaveLength(1);
    expect(left[0].y1).toBe(0);
    expect(left[0].y2).toBe(520);
  });

  it("两轴同时吸附", () => {
    const { dx, dy, guides } = snapMove(rect(105, 104), [rect(0, 0)], 8);
    expect(dx).toBe(-5);
    expect(dy).toBe(-4);
    expect(guides.some(guide => guide.axis === "x")).toBe(true);
    expect(guides.some(guide => guide.axis === "y")).toBe(true);
  });
});

describe("snapResize", () => {
  it("只有拖动的边参与吸附", () => {
    // 右边 = 196 吸到候选左边 200；左边 x=0 虽然也与候选对齐但不应额外产生线
    const { bounds, guides } = snapResize(rect(0, 300, 196, 50), { x: "max" }, [rect(200, 0)], 8);
    expect(bounds).toEqual(rect(0, 300, 200, 50));
    expect(guides.map(guide => guide.key)).toEqual(["x:200"]);
  });

  it("拖动左上角时 x、y 同时调整位置与尺寸", () => {
    const { bounds } = snapResize(
      rect(3, 4, 100, 100),
      { x: "min", y: "min" },
      [rect(0, 0, 50, 50)],
      8
    );
    expect(bounds).toEqual(rect(0, 0, 103, 104));
  });

  it("吸附导致尺寸非正时放弃该轴", () => {
    const { bounds, guides } = snapResize(
      rect(0, 0, 4, 50),
      { x: "max" },
      [rect(-2, 300, 2, 2)],
      8
    );
    expect(bounds).toEqual(rect(0, 0, 4, 50));
    expect(guides).toEqual([]);
  });
});

describe("grid", () => {
  it("移动时左上角取整到网格", () => {
    expect(snapMoveToGrid(rect(27, 41), 20)).toEqual({ dx: -7, dy: -1 });
  });

  it("缩放时拖动的边取整到网格", () => {
    expect(snapResizeToGrid(rect(10, 10, 47, 30), { x: "max" }, 20)).toEqual(rect(10, 10, 50, 30));
    expect(snapResizeToGrid(rect(13, 10, 47, 30), { x: "min" }, 20)).toEqual(rect(20, 10, 40, 30));
  });
});

describe("unionBounds", () => {
  it("返回并集包围盒，空输入返回 null", () => {
    expect(unionBounds([rect(0, 0, 10, 10), rect(20, 30, 10, 10)])).toEqual(rect(0, 0, 30, 40));
    expect(unionBounds([])).toBeNull();
  });
});
