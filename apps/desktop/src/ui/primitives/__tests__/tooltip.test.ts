/**
 * Tooltip 定位引擎单测 —— computeTooltipPosition 的四段中间件数学：
 * offset（间距 8）→ flip（主轴翻对侧）→ shift（交叉轴夹回视口）→ arrow（锚点中心投影）。
 * jsdom 无布局：anchor 传伪 DOMRect，pop 传尺寸对象；视口用 jsdom 默认 1024×768。
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { computeTooltipPosition } from "../tooltipPosition";

const rect = (left: number, top: number, w: number, h: number) => ({
  left,
  top,
  right: left + w,
  bottom: top + h,
  width: w,
  height: h,
});
const size = (width: number, height: number) => ({ offsetWidth: width, offsetHeight: height });

describe("computeTooltipPosition", () => {
  afterEach(() => vi.restoreAllMocks());

  it("top 居中：锚上方 8px、水平居中、箭头对准锚中心", () => {
    const r = computeTooltipPosition(rect(462, 300, 100, 40), size(120, 30), "top");
    expect(r.side).toBe("top");
    expect(r.y).toBe(300 - 8 - 30);
    expect(r.x).toBe(462 + 50 - 60);
    expect(r.arrowX).toBe(462 + 50 - (462 + 50 - 60) - 5); // 锚中心 - tip.x - 5（边框外缘补偿）= 55
    expect(r.arrowY).toBeNull();
  });

  it("flip：锚上方空间不足时翻到下方", () => {
    const r = computeTooltipPosition(rect(462, 20, 100, 40), size(120, 30), "top");
    expect(r.side).toBe("bottom");
    expect(r.y).toBe(20 + 40 + 8);
  });

  it("flip 保原位：上下都放不下时不翻（shift 兜底），避免遮挡锚点", () => {
    const r = computeTooltipPosition(rect(462, 20, 100, 40), size(120, 760), "top");
    expect(r.side).toBe("top");
  });

  it("shift：贴左缘时交叉轴夹回视口（留 8px 边距）", () => {
    const r = computeTooltipPosition(rect(0, 300, 20, 40), size(200, 30), "top");
    expect(r.x).toBe(8);
  });

  it("shift：贴右缘时右缘夹回视口内", () => {
    const r = computeTooltipPosition(rect(1004, 300, 20, 40), size(200, 30), "top");
    expect(r.x).toBe(1024 - 8 - 200);
  });

  it("align start/end：交叉轴对齐锚的起/终点", () => {
    const s = computeTooltipPosition(rect(462, 300, 100, 40), size(120, 30), "top-start");
    expect(s.x).toBe(462);
    const e = computeTooltipPosition(rect(462, 300, 100, 40), size(120, 30), "top-end");
    expect(e.x).toBe(562 - 120);
  });

  it("左右位：主轴换横轴，箭头投影到纵向", () => {
    const r = computeTooltipPosition(rect(500, 350, 100, 40), size(120, 30), "right");
    expect(r.side).toBe("right");
    expect(r.x).toBe(600 + 8);
    expect(r.y).toBe(350 + 20 - 15);
    expect(r.arrowY).toBe(350 + 20 - 355 - 5); // 锚中心 - tip.y - 5 = 10
    expect(r.arrowX).toBeNull();
  });

  it("箭头投影在边缘内 clamp（两端各留 10px）", () => {
    const r = computeTooltipPosition(rect(-30, 300, 60, 40), size(120, 30), "top");
    expect(r.arrowX).toBe(10);
  });
});
