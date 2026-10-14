import { describe, expect, it } from "vitest";
import { STICK_INK, STICK_MONO_FILL, STICK_TINTS } from "../../../constants/stickman";
import {
  STICK_CATEGORIES,
  STICK_POSES,
  buildStickStrokes,
  getStickPose,
  renderStickPrecise,
  renderStickSketch,
  type StickBody,
  type StickStroke,
} from "..";

const BODIES: StickBody[] = ["classic", "bean", "glyph"];
const numbers = (d: string) => (d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi) ?? []).map(Number);
const pose = (key: string) => {
  const found = getStickPose(key);
  if (!found) throw new Error(`缺少姿态 ${key}`);
  return found;
};
const firstLine = (strokes: StickStroke[]) => {
  const line = strokes.find(s => s.kind === "line");
  if (!line || line.kind !== "line") throw new Error("没有线条笔画");
  return line;
};

describe("姿态数据", () => {
  it("key 唯一，每个分类都有姿态，未知 key 返回 undefined", () => {
    const keys = STICK_POSES.map(p => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const cat of STICK_CATEGORIES) {
      expect(STICK_POSES.some(p => p.cat === cat.key)).toBe(true);
    }
    expect(getStickPose("no-such-pose")).toBeUndefined();
  });
});

describe("buildStickStrokes + 渲染", () => {
  it("全部姿态 × 形体 × 画风都产出有限坐标", () => {
    for (const p of STICK_POSES) {
      for (const body of BODIES) {
        const strokes = buildStickStrokes(p, { body, tint: "color" });
        expect(strokes.length).toBeGreaterThan(0);
        const precise = renderStickPrecise(strokes);
        const sketch = renderStickSketch(strokes, "natural", 7);
        for (const path of [...precise.paths, ...sketch.paths]) {
          const values = numbers(path.d);
          expect(values.length).toBeGreaterThan(0);
          expect(values.every(Number.isFinite)).toBe(true);
        }
      }
    }
  });

  it("手绘输出由 seed 决定：同 seed 同一笔，换 seed 换一笔", () => {
    const strokes = buildStickStrokes(pose("wave"), { body: "classic", tint: "mono" });
    const a = renderStickSketch(strokes, "natural", 42);
    expect(renderStickSketch(strokes, "natural", 42)).toEqual(a);
    expect(renderStickSketch(strokes, "natural", 43).paths[0].d).not.toBe(a.paths[0].d);
  });

  it("翻转镜像坐标，文字位置镜像但不改字", () => {
    const think = pose("think");
    const normal = buildStickStrokes(think, { body: "classic", tint: "mono" });
    const flipped = buildStickStrokes(think, { body: "classic", tint: "mono", flip: true });
    const line = firstLine(normal);
    const flippedLine = firstLine(flipped);
    expect(flippedLine.points[0][0]).toBeCloseTo(think.w - line.points[0][0]);
    expect(flippedLine.points[0][1]).toBe(line.points[0][1]);
    const text = renderStickPrecise(flipped).texts[0];
    expect(text).toMatchObject({ x: think.w - 98, text: "?" });
  });

  it("豆豆形体使用姿态里的 bean 关节覆盖", () => {
    const crouch = pose("crouch");
    const bean = crouch.people[0].bean!;
    const leg = firstLine(buildStickStrokes(crouch, { body: "bean", tint: "mono" }));
    expect(leg.points.slice(1)).toEqual(bean.ll);
    const classicLeg = firstLine(buildStickStrokes(crouch, { body: "classic", tint: "mono" }));
    expect(classicLeg.points.slice(1)).toEqual(crouch.people[0].ll);
  });

  it("点缀着色按人物序号轮换，单色统一浅灰", () => {
    const team = pose("team");
    const fills = (tint: "mono" | "color") =>
      buildStickStrokes(team, { body: "bean", tint })
        .filter(s => s.kind === "shape")
        .map(s => (s.kind === "shape" ? s.fill : null));
    expect(new Set(fills("color"))).toEqual(new Set(STICK_TINTS.slice(0, 3)));
    expect(new Set(fills("mono"))).toEqual(new Set([STICK_MONO_FILL]));
  });

  it("墨色只用主题变量", () => {
    const strokes = buildStickStrokes(pose("idea"), { body: "glyph", tint: "color" });
    const { paths } = renderStickPrecise(strokes);
    for (const path of paths) {
      if (path.stroke) expect(path.stroke).toBe(STICK_INK);
      expect(path.fill).toMatch(/^(none|var\(--tau-|color-mix\()/);
    }
  });
});
