/**
 * 浮层定位引擎单测 —— computeAnchoredPosition 的四段中间件数学：
 * offset（间距 8）→ flip（主轴翻对侧，按主轴占位尺寸判空间）→ shift（夹回视口，
 * 且仅在锚点与视口相交时生效）→ arrow（锚点中心投影）。
 * jsdom 无布局：anchor 传伪 DOMRect，pop 传尺寸对象；视口用 jsdom 默认 1024×768。
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyArrowPosition,
  computeAnchoredPosition,
  type AnchoredPosition,
  type AnchoredSide,
} from "../anchoredPosition";

const rect = (left: number, top: number, w: number, h: number) => ({
  left,
  top,
  right: left + w,
  bottom: top + h,
  width: w,
  height: h,
});
const size = (width: number, height: number) => ({ offsetWidth: width, offsetHeight: height });

describe("computeAnchoredPosition", () => {
  afterEach(() => vi.restoreAllMocks());

  it("top 居中：锚上方 8px、水平居中、箭头对准锚中心", () => {
    const r = computeAnchoredPosition(rect(462, 300, 100, 40), size(120, 30), "top");
    expect(r.side).toBe("top");
    expect(r.y).toBe(300 - 8 - 30);
    expect(r.x).toBe(462 + 50 - 60);
    expect(r.arrowX).toBe(462 + 50 - (462 + 50 - 60) - 5); // 锚中心 - tip.x - 5（边框外缘补偿）= 55
    expect(r.arrowY).toBeNull();
  });

  it("flip：锚上方空间不足时翻到下方", () => {
    const r = computeAnchoredPosition(rect(462, 20, 100, 40), size(120, 30), "top");
    expect(r.side).toBe("bottom");
    expect(r.y).toBe(20 + 40 + 8);
  });

  it("flip 保原位：上下都放不下时不翻（shift 兜底），避免遮挡锚点", () => {
    const r = computeAnchoredPosition(rect(462, 20, 100, 40), size(120, 760), "top");
    expect(r.side).toBe("top");
  });

  it("shift：贴左缘时交叉轴夹回视口（留 8px 边距）", () => {
    const r = computeAnchoredPosition(rect(0, 300, 20, 40), size(200, 30), "top");
    expect(r.x).toBe(8);
  });

  it("shift：贴右缘时右缘夹回视口内", () => {
    const r = computeAnchoredPosition(rect(1004, 300, 20, 40), size(200, 30), "top");
    expect(r.x).toBe(1024 - 8 - 200);
  });

  it("align start/end：交叉轴对齐锚的起/终点", () => {
    const s = computeAnchoredPosition(rect(462, 300, 100, 40), size(120, 30), "top-start");
    expect(s.x).toBe(462);
    const e = computeAnchoredPosition(rect(462, 300, 100, 40), size(120, 30), "top-end");
    expect(e.x).toBe(562 - 120);
  });

  it("左右位：主轴换横轴，箭头投影到纵向", () => {
    const r = computeAnchoredPosition(rect(500, 350, 100, 40), size(120, 30), "right");
    expect(r.side).toBe("right");
    expect(r.x).toBe(600 + 8);
    expect(r.y).toBe(350 + 20 - 15);
    expect(r.arrowY).toBe(350 + 20 - 355 - 5); // 锚中心 - tip.y - 5 = 10
    expect(r.arrowX).toBeNull();
  });

  it("箭头投影在边缘内 clamp（两端各留 10px）", () => {
    const r = computeAnchoredPosition(rect(-30, 300, 60, 40), size(120, 30), "top");
    expect(r.arrowX).toBe(10);
  });

  describe("shift 闸门：锚点离屏时不夹回视口", () => {
    it("锚点滚到视口下方：tip 跟随锚点离屏，不被钉在视口底边", () => {
      // 锚点 top=1200 > vh(768)。夹取会把 y 拉到 730（视口底边）→ 与锚点脱钩，
      // 一屏多个离屏锚点的 tip 全挤在底边（样板间 12 常显 tip 的堆叠即此）
      const r = computeAnchoredPosition(rect(462, 1200, 100, 40), size(120, 30), "top");
      expect(r.y).toBe(1200 - 8 - 30);
    });

    it("锚点滚到视口上方：tip 跟随锚点离屏，不浮到视口顶边", () => {
      // 锚点 bottom=-160 < 0 → 翻到下方、y=-152；夹取会把它拉到 8（视口顶边）
      const r = computeAnchoredPosition(rect(462, -200, 100, 40), size(120, 30), "top");
      expect(r.side).toBe("bottom");
      expect(r.y).toBe(-160 + 8);
    });

    it("锚点只要还与视口相交就照常夹（闸门边界）", () => {
      const r = computeAnchoredPosition(rect(0, 764, 20, 40), size(200, 30), "top");
      expect(r.x).toBe(8);
    });
  });

  it("左右位 flip 按宽度判空间（原先误用高度，横向放不下也不翻）", () => {
    // 锚点左侧只有 50-8=42px，tip 宽 120 → 放不下，应翻到右侧
    const r = computeAnchoredPosition(rect(50, 300, 80, 40), size(120, 30), "left");
    expect(r.side).toBe("right");
    expect(r.x).toBe(130 + 8);
  });

  it("gap 可调：下拉族传 4 时与锚点更贴（Select/Menu 复用引擎的口径）", () => {
    const r = computeAnchoredPosition(rect(462, 300, 100, 40), size(150, 200), "bottom", {
      gap: 4,
    });
    expect(r.y).toBe(340 + 4);
  });
});

describe("applyArrowPosition", () => {
  const pos = (
    side: AnchoredSide,
    arrowX: number | null,
    arrowY: number | null
  ): AnchoredPosition => ({
    x: 0,
    y: 0,
    side,
    arrowX,
    arrowY,
  });

  it("side 翻转后交叉轴显式复位，不留上一姿态的残留", () => {
    const pop = document.createElement("div");
    const ar = document.createElement("span");
    pop.appendChild(ar);

    applyArrowPosition(pos("top", 40, null), pop);
    expect(ar.style.bottom).toBe("-5px");
    expect(ar.style.right).toBe("auto");

    // top → left：top 位写入的 bottom 必须置回 auto（否则靠过约束解析兜底）
    applyArrowPosition(pos("left", null, 30), pop);
    expect(ar.style.bottom).toBe("auto");
    expect(ar.style.right).toBe("-5px");

    // left → top：left 位写入的 right 同理
    applyArrowPosition(pos("top", 40, null), pop);
    expect(ar.style.right).toBe("auto");
    expect(ar.style.bottom).toBe("-5px");
  });

  it("浮层无子元素时静默跳过", () => {
    const pop = document.createElement("div");
    expect(() => applyArrowPosition(pos("top", 40, null), pop)).not.toThrow();
  });
});
