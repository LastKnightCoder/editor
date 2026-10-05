import { describe, expect, it } from "vitest";
import { snapMove } from "../SnapGeometry";
import { collectGaps } from "../SnapGaps";

const rect = (x: number, y: number, width = 100, height = 100) => ({ x, y, width, height });

const gapGuides = (guides: ReturnType<typeof snapMove>["guides"]) =>
  guides
    .filter(guide => guide.kind === "gap")
    .map(({ x1, y1, x2, y2 }) => ({ x1, y1, x2, y2 }))
    .sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1);

describe("collectGaps", () => {
  it("只与正方向最近邻配对，不跨过中间元素", () => {
    const gaps = collectGaps([rect(0, 0), rect(150, 0), rect(300, 0)], "x");
    expect(gaps.map(gap => [gap.start.x, gap.end.x, gap.length])).toEqual([
      [0, 150, 50],
      [150, 300, 50],
    ]);
  });

  it("垂直方向不重叠的元素不构成间距", () => {
    expect(collectGaps([rect(0, 0), rect(150, 500)], "x")).toEqual([]);
  });
});

describe("snapMove 等距", () => {
  it("居中于两个元素之间，两侧间距相等", () => {
    const { dx, guides } = snapMove(rect(148, 0), [rect(0, 0), rect(300, 0)], 8);
    expect(dx).toBe(2);
    expect(gapGuides(guides)).toEqual([
      { x1: 100, y1: 50, x2: 150, y2: 50 },
      { x1: 250, y1: 50, x2: 300, y2: 50 },
    ]);
  });

  it("接在一对元素之后复制间距", () => {
    const { dx, guides } = snapMove(rect(303, 0), [rect(0, 0), rect(150, 0)], 8);
    expect(dx).toBe(-3);
    expect(gapGuides(guides)).toEqual([
      { x1: 100, y1: 50, x2: 150, y2: 50 },
      { x1: 250, y1: 50, x2: 300, y2: 50 },
    ]);
  });

  it("接在一对元素之前复制间距", () => {
    const { dx } = snapMove(rect(-147, 0), [rect(0, 0), rect(150, 0)], 8);
    expect(dx).toBe(-3);
  });

  it("纵向同样生效", () => {
    const { dy, guides } = snapMove(rect(0, 304), [rect(0, 0), rect(0, 150)], 8);
    expect(dy).toBe(-4);
    expect(gapGuides(guides)).toEqual([
      { x1: 50, y1: 100, x2: 50, y2: 150 },
      { x1: 50, y1: 250, x2: 50, y2: 300 },
    ]);
  });

  it("等长且首尾相连的间距整条序列一起显示", () => {
    const { guides } = snapMove(rect(453, 0), [rect(0, 0), rect(150, 0), rect(300, 0)], 8);
    expect(gapGuides(guides).map(guide => [guide.x1, guide.x2])).toEqual([
      [100, 150],
      [250, 300],
      [400, 450],
    ]);
  });

  it("垂直方向与间距无重叠时不做等距吸附", () => {
    const { dx, guides } = snapMove(rect(303, 500), [rect(0, 0), rect(150, 0)], 8);
    expect(dx).toBe(0);
    expect(gapGuides(guides)).toEqual([]);
  });

  it("等距与对齐取更近的那个", () => {
    // 等距目标 x=300（偏移 -6）；远处元素左边 x=305 给出对齐偏移 -1，更近者胜
    const { dx, guides } = snapMove(rect(306, 0), [rect(0, 0), rect(150, 0), rect(305, 800)], 8);
    expect(dx).toBe(-1);
    expect(gapGuides(guides)).toEqual([]);
  });
});
