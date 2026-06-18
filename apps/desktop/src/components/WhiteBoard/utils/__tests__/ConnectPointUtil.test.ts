import { describe, expect, it } from "vitest";
import {
  getCustomConnectCandidate,
  isInteriorConnectBound,
  isInteriorConnectElement,
  getConnectEdgeOrientation,
} from "../ConnectPointUtil";
import { ARROW_CONNECT_ID } from "../../constants";
import type { ArrowElement, BoardElement } from "../../types";

const ZOOM = 1;

const rect = (x: number, y: number, w: number, h: number) =>
  ({
    x,
    y,
    width: w,
    height: h,
    id: "r",
    type: "richtext",
  }) as BoardElement & { x: number; y: number; width: number; height: number };

describe("getCustomConnectCandidate - 射线与 bbox 边缘交点", () => {
  it("鼠标在右侧外（closing 范围内）：命中右边中点附近", () => {
    const el = rect(0, 0, 100, 100);
    const c = getCustomConnectCandidate(el, { x: 108, y: 50 }, ZOOM);
    expect(c).not.toBeNull();
    expect(c!.point.x).toBeCloseTo(100, 5);
    expect(c!.point.y).toBeCloseTo(50, 5);
    expect(c!.customOffset.u).toBeCloseTo(1, 5);
    expect(c!.customOffset.v).toBeCloseTo(0.5, 5);
  });

  it("鼠标在右上方外（closing 范围内）：命中右边（u=1）", () => {
    const el = rect(0, 0, 100, 100);
    const c = getCustomConnectCandidate(el, { x: 108, y: -6 }, ZOOM);
    expect(c).not.toBeNull();
    // 方向 dx=58, dy=-56；tx=50/58≈0.86, ty=50/56≈0.89 → t=tx → 命中右边
    expect(c!.customOffset.u).toBeCloseTo(1, 5);
  });

  it("鼠标在 bbox 内靠近上边：命中上边", () => {
    const el = rect(0, 0, 100, 100);
    const c = getCustomConnectCandidate(el, { x: 50, y: 8 }, ZOOM);
    expect(c).not.toBeNull();
    expect(c!.customOffset.v).toBeCloseTo(0, 5);
    expect(c!.customOffset.u).toBeCloseTo(0.5, 5);
  });

  it("鼠标远离 bbox（超出阈值）：不吸附", () => {
    const el = rect(0, 0, 100, 100);
    expect(getCustomConnectCandidate(el, { x: 160, y: 50 }, ZOOM)).toBeNull();
  });

  it("鼠标深入 bbox 中心：距离超阈值，不吸附", () => {
    const el = rect(0, 0, 100, 100);
    const c = getCustomConnectCandidate(el, { x: 50, y: 50 }, ZOOM);
    expect(c).toBeNull();
  });

  it("鼠标深入 bbox 内部偏离中心：距离超阈值，不吸附", () => {
    const el = rect(0, 0, 200, 200);
    const c = getCustomConnectCandidate(el, { x: 110, y: 100 }, ZOOM);
    expect(c).toBeNull();
  });

  it("零尺寸元素返回 null", () => {
    const el = rect(0, 0, 0, 100);
    expect(getCustomConnectCandidate(el, { x: 5, y: 50 }, ZOOM)).toBeNull();
  });
});

describe("isInteriorConnectBound - 内部端点判定", () => {
  it("center 为内部", () => {
    expect(isInteriorConnectBound({ connectId: "center" })).toBe(true);
  });

  it("上下左右为边界（非内部）", () => {
    expect(isInteriorConnectBound({ connectId: "top" })).toBe(false);
    expect(isInteriorConnectBound({ connectId: "left" })).toBe(false);
  });

  it("custom 在边界上（u=0 或 v=0）非内部", () => {
    expect(
      isInteriorConnectBound({
        connectId: ARROW_CONNECT_ID.CUSTOM,
        customOffset: { u: 0, v: 0.5 },
      }),
    ).toBe(false);
    expect(
      isInteriorConnectBound({
        connectId: ARROW_CONNECT_ID.CUSTOM,
        customOffset: { u: 0.5, v: 1 },
      }),
    ).toBe(false);
  });

  it("custom 严格内部 (0.3,0.4) 为内部", () => {
    expect(
      isInteriorConnectBound({
        connectId: ARROW_CONNECT_ID.CUSTOM,
        customOffset: { u: 0.3, v: 0.4 },
      }),
    ).toBe(true);
  });
});

describe("isInteriorConnectElement", () => {
  const makeArrow = (source: any, target?: any): BoardElement =>
    ({
      id: "a",
      type: "arrow",
      source,
      target: target ?? { marker: "none" },
    }) as ArrowElement;

  it("非箭头元素返回 false", () => {
    expect(
      isInteriorConnectElement({ id: "x", type: "richtext" } as BoardElement),
    ).toBe(false);
  });

  it("source 为 center 的箭头返回 true", () => {
    expect(isInteriorConnectElement(makeArrow({ connectId: "center" }))).toBe(
      true,
    );
  });

  it("两端均为边界点返回 false", () => {
    expect(
      isInteriorConnectElement(
        makeArrow({ connectId: "left" }, { connectId: "right" }),
      ),
    ).toBe(false);
  });
});

describe("getConnectEdgeOrientation - 正交线方向", () => {
  it("top/bottom → vertical", () => {
    expect(getConnectEdgeOrientation("top")).toBe("vertical");
    expect(getConnectEdgeOrientation("bottom")).toBe("vertical");
  });

  it("left/right → horizontal", () => {
    expect(getConnectEdgeOrientation("left")).toBe("horizontal");
    expect(getConnectEdgeOrientation("right")).toBe("horizontal");
  });

  it("custom 上边 (v=0) → vertical", () => {
    expect(
      getConnectEdgeOrientation(ARROW_CONNECT_ID.CUSTOM, { u: 0.3, v: 0 }),
    ).toBe("vertical");
  });

  it("custom 右边 (u=1) → horizontal", () => {
    expect(
      getConnectEdgeOrientation(ARROW_CONNECT_ID.CUSTOM, { u: 1, v: 0.4 }),
    ).toBe("horizontal");
  });

  it("custom 严格内部 → null（回退距离启发式）", () => {
    expect(
      getConnectEdgeOrientation(ARROW_CONNECT_ID.CUSTOM, { u: 0.3, v: 0.4 }),
    ).toBeNull();
  });

  it("center → null", () => {
    expect(getConnectEdgeOrientation("center")).toBeNull();
  });
});
