import { describe, expect, it } from "vitest";
import { EMarkerType } from "../../../types/arrow";
import { DEFAULT_PAGE_SKETCH } from "../../../types/sketch";
import { roundedRectSides } from "../../dash";
import { flattenPath, polylineToD, resample, wobble, type Vec } from "../geometry";
import { inkSize } from "../levels";
import { createRandom, hashSeed } from "../random";
import { hatchGap, sketchShape, type SketchShapeInput } from "../shape";
import { markerLength, sketchArrow, type SketchArrowInput } from "../arrow";
import { resolveSketch } from "../resolve";

const numbers = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

const shape = (patch: Partial<SketchShapeInput> = {}): SketchShapeInput => ({
  outline: { kind: "rect" },
  width: 120,
  height: 60,
  stroke: "#333",
  strokeWidth: 2,
  fill: "#8fb3e6",
  fillStyle: "solid",
  level: "natural",
  seed: 7,
  ...patch,
});

const arrow = (patch: Partial<SketchArrowInput> = {}): SketchArrowInput => ({
  d: "M 0 0 L 200 0",
  color: "#333",
  strokeWidth: 2,
  sourceMarker: EMarkerType.None,
  targetMarker: EMarkerType.Arrow,
  level: "natural",
  seed: 11,
  ...patch,
});

describe("flattenPath", () => {
  it("拆平直线、曲线与闭合", () => {
    const [line] = flattenPath("M 0 0 L 10 0 L 10 10 Z");
    expect(line.closed).toBe(true);
    expect(line.points[0]).toEqual([0, 0]);
    expect(line.points[line.points.length - 1]).toEqual([0, 0]);

    const [curve] = flattenPath("M 0 0 C 0 50 100 50 100 0");
    expect(curve.points.length).toBeGreaterThan(4);
    expect(curve.points[curve.points.length - 1]).toEqual([100, 0]);
    expect(Math.max(...curve.points.map(p => p[1]))).toBeCloseTo(37.5, 0);
  });

  it("支持 H/V/Q 与相对命令、省略命令字母的重复参数", () => {
    const [line] = flattenPath("M10 10 h 20 v 20 l -20 0 Q 0 30 10 10");
    expect(line.points[1]).toEqual([30, 10]);
    expect(line.points[2]).toEqual([30, 30]);
    expect(line.points[3]).toEqual([10, 30]);
    expect(line.points[line.points.length - 1]).toEqual([10, 10]);

    const [implicit] = flattenPath("M 0 0 10 0 10 10");
    expect(implicit.points).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
  });

  it("椭圆弧：几何配置中的圆形路径拆平后落在圆上", () => {
    const [circle] = flattenPath("M 100,50 A 50,50 0 1,0 0,50 A 50,50 0 1,0 100,50");
    for (const [x, y] of circle.points) {
      expect(Math.hypot(x - 50, y - 50)).toBeCloseTo(50, 1);
    }
    expect(circle.points.some(([, y]) => y > 99)).toBe(true);
    expect(circle.points.some(([, y]) => y < 1)).toBe(true);
  });

  it("多个子路径分别输出", () => {
    expect(flattenPath("M 0 0 L 1 1 M 5 5 L 6 6")).toHaveLength(2);
  });
});

describe("wobble", () => {
  it("同一 seed 输出相同，不同 seed 输出不同", () => {
    const line = resample(
      [
        [0, 0],
        [300, 0],
      ],
      3
    );
    const a = wobble(line, 2, createRandom(1));
    expect(wobble(line, 2, createRandom(1))).toEqual(a);
    expect(wobble(line, 2, createRandom(2))).not.toEqual(a);
  });

  it("端点移动 1px 时，靠近起点的部分基本不变（连续，不整体跳变）", () => {
    const make = (end: number) =>
      wobble(
        resample(
          [
            [0, 0],
            [end, 0],
          ],
          3
        ),
        2,
        createRandom(5)
      );
    const a = make(300);
    const b = make(301);
    const head = Math.floor(a.length / 3);
    for (let i = 0; i < head; i++) {
      expect(Math.abs(a[i][1] - b[i][1])).toBeLessThan(0.5);
    }
  });
});

describe("sketchShape", () => {
  it("同输入同输出（笔迹稳定）", () => {
    expect(sketchShape(shape())).toEqual(sketchShape(shape()));
  });

  it("换一笔（seed 变化）改变轮廓", () => {
    const ink = (seed: number) => sketchShape(shape({ seed })).find(p => p.role === "ink")!.d;
    expect(ink(1)).not.toEqual(ink(2));
  });

  it("填充在下、墨迹在上；四种填充各自的角色", () => {
    const roles = (fillStyle: SketchShapeInput["fillStyle"]) =>
      sketchShape(shape({ fillStyle })).map(p => p.role);
    expect(roles("solid")).toEqual(["wash", "ink"]);
    expect(roles("hatch")).toEqual(["lines", "ink"]);
    expect(roles("cross")).toEqual(["lines", "ink"]);
    expect(roles("scribble")).toEqual(["lines", "ink"]);
  });

  it("线类填充限制在轮廓内，淡涂不裁剪", () => {
    expect(sketchShape(shape({ fillStyle: "hatch" }))[0].clip).toBeTruthy();
    expect(sketchShape(shape({ fillStyle: "solid" }))[0].clip).toBeUndefined();
  });

  it("淡涂遵守 fillOpacity，描边遵守 strokeOpacity", () => {
    const [wash, ink] = sketchShape(shape({ fillOpacity: 0.5, strokeOpacity: 0.4 }));
    expect(wash.opacity).toBeCloseTo(0.35);
    expect(ink.opacity).toBe(0.4);
  });

  it("无填充、无描边时不输出对应部分", () => {
    expect(sketchShape(shape({ fill: "none" })).map(p => p.role)).toEqual(["ink"]);
    expect(sketchShape(shape({ fill: undefined, stroke: undefined }))).toEqual([]);
  });

  it("墨迹不跑出元素太远：摆动有界", () => {
    const ink = sketchShape(shape({ level: "loose" })).find(p => p.role === "ink")!;
    const values = numbers(ink.d);
    expect(Math.min(...values)).toBeGreaterThan(-12);
    expect(Math.max(...values)).toBeLessThan(120 + 12);
  });

  it("路径轮廓（心形 / 三角）可用，开放路径只描边不填充", () => {
    const tri = sketchShape(
      shape({ outline: { kind: "path", paths: ["M 0 0 L 120 0 L 60 60 Z"] } })
    );
    expect(tri.map(p => p.role)).toEqual(["wash", "ink"]);
    const open = sketchShape(shape({ outline: { kind: "path", paths: ["M 0 0 L 120 60"] } }));
    expect(open.map(p => p.role)).toEqual(["ink"]);
  });

  it("排线间距随线宽单调不减", () => {
    expect(hatchGap(1, 100, 100)).toBeLessThanOrEqual(hatchGap(2, 100, 100));
    expect(hatchGap(2, 100, 100)).toBeLessThanOrEqual(hatchGap(4, 100, 100));
  });

  it("rect 虚线：逐边 4 段遮罩、整数个周期、offset 为半段墨", () => {
    const input = shape({
      outline: { kind: "rect", cornerRadius: 8 },
      width: 300,
      height: 200,
      stroke: "#000",
      level: "neat",
      seed: 1,
      strokeDash: "dashed",
    });
    const masks = sketchShape(input).find(p => p.role === "ink")!.dashMask!;
    expect(masks).toHaveLength(4);
    roundedRectSides(300, 200, 8).forEach((side, i) => {
      expect(masks[i].width).toBeCloseTo(inkSize(2) * 3, 5);
      const cycles = side.length / (masks[i].dash + masks[i].gap);
      expect(cycles).toBeCloseTo(Math.round(cycles), 5);
      expect(masks[i].offset).toBeCloseTo(masks[i].dash / 2, 5);
    });
  });

  it("rect 点线：dash 为 0、遮罩更细", () => {
    const masks = sketchShape(
      shape({
        outline: { kind: "rect", cornerRadius: 8 },
        level: "neat",
        seed: 1,
        strokeDash: "dotted",
      })
    ).find(p => p.role === "ink")!.dashMask!;
    expect(masks).toHaveLength(4);
    for (const mask of masks) {
      expect(mask.dash).toBe(0);
      expect(mask.width).toBeCloseTo(inkSize(2) * 1.3, 5);
    }
  });

  it("不传 strokeDash 与显式 undefined 输出完全相同，实线描边项无 dashMask", () => {
    const solid = sketchShape(shape({ level: "neat", seed: 3 }));
    expect(sketchShape(shape({ level: "neat", seed: 3, strokeDash: undefined }))).toEqual(solid);
    expect(solid.find(p => p.role === "ink")!.dashMask).toBeUndefined();
  });

  it("椭圆不响应 strokeDash（无遮罩）", () => {
    const ink = sketchShape(shape({ outline: { kind: "ellipse" }, strokeDash: "dashed" })).find(
      p => p.role === "ink"
    )!;
    expect(ink.dashMask).toBeUndefined();
  });

  it("虚线框同输入同输出（确定性）", () => {
    const input = () =>
      shape({
        outline: { kind: "rect", cornerRadius: 8 },
        level: "neat",
        seed: 5,
        strokeDash: "dashed",
      });
    expect(sketchShape(input())).toEqual(sketchShape(input()));
  });
});

describe("sketchArrow", () => {
  it("同输入同输出", () => {
    expect(sketchArrow(arrow())).toEqual(sketchArrow(arrow()));
  });

  it("虚线只加遮罩，不改变墨迹（虚线与流动不重算墨迹）", () => {
    const solid = sketchArrow(arrow());
    const dashed = sketchArrow(arrow({ dashed: true }));
    expect(dashed.paths[0].d).toEqual(solid.paths[0].d);
    expect(solid.paths[0].dashMask).toBeUndefined();
    expect(dashed.paths[0].dashMask).toHaveLength(1);
    expect(dashed.paths[0].dashMask?.[0]).toMatchObject({ d: dashed.centerline });
  });

  it("端点标记按类型输出，none 不输出", () => {
    const count = (m: EMarkerType) => sketchArrow(arrow({ targetMarker: m })).paths.length;
    expect(count(EMarkerType.None)).toBe(1);
    expect(count(EMarkerType.Arrow)).toBe(2);
    expect(count(EMarkerType.OpenArrow)).toBe(2);
    expect(count(EMarkerType.ClosedArrow)).toBe(3);
    expect(count(EMarkerType.Diamond)).toBe(3);
    expect(count(EMarkerType.Circle)).toBe(3);
    expect(sketchArrow(arrow({ sourceMarker: EMarkerType.Arrow })).paths).toHaveLength(3);
  });

  it("箭头头长随线宽增长且封顶", () => {
    expect(markerLength(1)).toBeLessThan(markerLength(3));
    expect(markerLength(20)).toBe(22);
  });

  it("箭头尖落在终点附近、翼朝后", () => {
    const head = sketchArrow(arrow()).paths[1];
    const xs = numbers(head.d).filter((_, i) => i % 2 === 0);
    expect(Math.max(...xs)).toBeGreaterThan(195);
    expect(Math.min(...xs)).toBeGreaterThan(170);
  });

  it("退化输入不抛错", () => {
    expect(sketchArrow(arrow({ d: "" })).paths).toEqual([]);
    expect(sketchArrow(arrow({ d: "M 5 5" })).paths).toEqual([]);
  });
});

describe("resolveSketch", () => {
  const page = { mode: "sketch" as const, level: "loose" as const };

  it("跟随页面；元素覆盖优先", () => {
    expect(resolveSketch(page, { id: "a", type: "geometry" })).toMatchObject({
      enabled: true,
      level: "loose",
    });
    expect(resolveSketch(DEFAULT_PAGE_SKETCH, { id: "a", type: "geometry" }).enabled).toBe(false);
    expect(
      resolveSketch(page, { id: "a", type: "geometry", sketch: { mode: "normal" } }).enabled
    ).toBe(false);
    expect(
      resolveSketch(DEFAULT_PAGE_SKETCH, {
        id: "a",
        type: "arrow",
        sketch: { mode: "sketch", level: "neat" },
      })
    ).toMatchObject({ enabled: true, level: "neat" });
  });

  it("手写不跟随手绘（本来就是墨迹），媒体与文档卡跟随", () => {
    expect(resolveSketch(page, { id: "a", type: "handwrite" }).enabled).toBe(false);
    expect(resolveSketch(page, { id: "a", type: "image" }).enabled).toBe(true);
    expect(resolveSketch(page, { id: "a", type: "document" }).enabled).toBe(true);
  });

  it("seed 默认由 id 派生，换一笔写入的 seed 优先", () => {
    expect(resolveSketch(page, { id: "abc", type: "geometry" }).seed).toBe(hashSeed("abc"));
    expect(resolveSketch(page, { id: "abc", type: "geometry", sketch: { seed: 42 } }).seed).toBe(
      42
    );
  });

  it("导图节点跟随根节点的覆盖，但各节点笔迹不同", () => {
    const root = { id: "root", type: "mind-node", sketch: { mode: "normal" as const, seed: 9 } };
    const child = { id: "child", type: "mind-node" };
    expect(resolveSketch(page, child, root).enabled).toBe(false);
    const sibling = { id: "sibling", type: "mind-node" };
    expect(resolveSketch(page, child, root).seed).not.toBe(resolveSketch(page, sibling, root).seed);
  });
});

describe("polylineToD", () => {
  it("闭合时追加 Z", () => {
    const pts: Vec[] = [
      [0, 0],
      [1, 1],
    ];
    expect(polylineToD(pts, true)).toBe("M0 0 L1 1 Z");
  });
});
