import { describe, expect, it } from "vitest";
import { hasMoreBelow, planCamera, type BlockBox } from "../cameraPlan";

/** 按高度序列排出块（块间距 18） */
function layout(items: Array<number | [number, "h"]>): BlockBox[] {
  let top = 0;
  return items.map(item => {
    const [height, heading] = Array.isArray(item) ? [item[0], true] : [item, false];
    const box = { top, height, heading };
    top += height + 18;
    return box;
  });
}

describe("planCamera", () => {
  it("放得下居中，略长整体缩小", () => {
    expect(planCamera(layout([100, 100]), 400)).toMatchObject({
      fit: 1,
      steps: [0],
      centered: true,
    });
    const shrunk = planCamera(layout([240, 200]), 400);
    expect(shrunk.steps).toEqual([0]);
    expect(shrunk.fit).toBeCloseTo(400 / 458);
  });

  it("再长按块边界切屏，屏底标题随下一块进下一屏", () => {
    const blocks = layout([120, 120, [40, "h"], 200, 120, 160]);
    const plan = planCamera(blocks, 400);
    // 第三块标题完整可见但下一块被截断：下一屏从标题开始；末屏内容底边贴视口底边
    expect(plan.steps).toEqual([0, blocks[2].top, plan.total - 400]);
    expect(plan.centered).toBe(false);
    expect(hasMoreBelow(plan, 0, 400)).toBe(true);
    expect(hasMoreBelow(plan, plan.steps.length - 1, 400)).toBe(false);
  });

  it("单块高于一屏时块内按比例推进，末屏不越过内容底边", () => {
    const plan = planCamera(layout([1000]), 400);
    expect(plan.steps).toEqual([0, 340, 600]);
  });
});
