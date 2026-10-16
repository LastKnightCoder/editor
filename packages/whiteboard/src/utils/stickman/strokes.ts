import {
  STICK_MONO_FILL,
  STICK_PAPER,
  STICK_TINTS,
  STICK_WARN_FILL,
} from "../../constants/stickman";
import { distance } from "../sketch/geometry";
import type {
  StickBody,
  StickPerson,
  StickPersonJoints,
  StickPose,
  StickProp,
  StickStroke,
  StickStyle,
  StickTint,
  Vec,
} from "./types";

/** 各形体的线宽：四肢 / 躯干（或轮廓）/ 道具 */
const BODY_WIDTH: Record<StickBody, { limb: number; spine: number; prop: number }> = {
  classic: { limb: 3, spine: 3, prop: 2.4 },
  bean: { limb: 3, spine: 2.6, prop: 2.4 },
  glyph: { limb: 8, spine: 11, prop: 3 },
};

const lerp = (a: Vec, b: Vec, t: number): Vec => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
const add = (p: Vec, v: Vec, d: number): Vec => [p[0] + v[0] * d, p[1] + v[1] * d];

function circlePoints(c: Vec, r: number, count = 40): Vec[] {
  return Array.from({ length: count }, (_, i): Vec => {
    const a = (Math.PI * 2 * i) / count;
    return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
  });
}

/** 胶囊轮廓：a、b 为两端圆心 */
function capsulePoints(a: Vec, b: Vec, r: number): Vec[] {
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const half = (center: Vec, from: number) =>
    Array.from({ length: 15 }, (_, i): Vec => {
      const t = from + (Math.PI * i) / 14;
      return [center[0] + Math.cos(t) * r, center[1] + Math.sin(t) * r];
    });
  return [...half(b, angle - Math.PI / 2), ...half(a, angle + Math.PI / 2)];
}

const rectPoints = (x: number, y: number, w: number, h: number): Vec[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

/** 脊柱的单位法线，朝 toward 所在的一侧（豆豆形体的肩、胯定位） */
function sideNormal(axisA: Vec, axisB: Vec, origin: Vec, toward: Vec): Vec {
  const dx = axisB[0] - axisA[0];
  const dy = axisB[1] - axisA[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const side = (toward[0] - origin[0]) * nx + (toward[1] - origin[1]) * ny >= 0 ? 1 : -1;
  return [nx * side, ny * side];
}

function tintFill(tint: StickTint, index: number): string {
  return tint === "color" ? STICK_TINTS[index % STICK_TINTS.length] : STICK_MONO_FILL;
}

function personStrokes(person: StickPerson, body: StickBody, tint: StickTint, index: number) {
  const P: StickPersonJoints =
    body === "bean" && person.bean ? { ...person, ...person.bean } : person;
  const width = BODY_WIDTH[body];
  const limb = (from: Vec, segment: readonly Vec[]): StickStroke => ({
    kind: "line",
    points: [from, ...segment],
    width: width.limb,
  });
  const shoulder = lerp(P.n, P.p, 0.18);

  if (body === "classic") {
    return [
      limb(P.p, P.ll),
      limb(P.p, P.rl),
      { kind: "line", points: [P.n, P.p], width: width.spine },
      limb(shoulder, P.la),
      limb(shoulder, P.ra),
      { kind: "shape", points: circlePoints(P.h, 13), width: width.spine, fill: STICK_PAPER },
    ] satisfies StickStroke[];
  }

  if (body === "bean") {
    const len = distance(P.n, P.p);
    const top = lerp(P.n, P.p, 11 / len);
    const bottom = lerp(P.n, P.p, (len - 6) / len);
    const fill = tintFill(tint, index);
    const leg = (segment: readonly Vec[]) =>
      limb(add(P.p, sideNormal(P.n, P.p, P.p, segment[0]), 5), segment);
    // 手臂起点藏在躯干内、先于躯干绘制，接缝由躯干轮廓盖住；肘、手外推，避免贴着身体轮廓走
    const arm = ([elbow, hand]: readonly Vec[]) => {
      const v = sideNormal(P.n, P.p, top, elbow);
      return limb(add(top, v, 4), [add(elbow, v, 8), add(hand, v, 5)]);
    };
    return [
      leg(P.ll),
      leg(P.rl),
      arm(P.la),
      arm(P.ra),
      { kind: "shape", points: capsulePoints(top, bottom, 12), width: width.spine, fill },
      { kind: "shape", points: circlePoints(P.h, 14), width: width.spine, fill },
    ] satisfies StickStroke[];
  }

  // 象形：头与颈之间留缝，像公共标识
  const headLen = distance(P.h, P.n);
  const head = lerp(P.n, P.h, (headLen + 3) / headLen);
  const neck = lerp(P.n, P.p, 7 / distance(P.n, P.p));
  return [
    limb(P.p, P.ll),
    limb(P.p, P.rl),
    { kind: "line", points: [neck, P.p], width: width.spine },
    limb(shoulder, P.la),
    limb(shoulder, P.ra),
    { kind: "shape", points: circlePoints(head, 11), fill: "ink" },
  ] satisfies StickStroke[];
}

function propStroke(prop: StickProp, body: StickBody, tint: StickTint): StickStroke {
  const width = BODY_WIDTH[body].prop;
  if (prop.t === "text")
    return { kind: "text", x: prop.x, y: prop.y, text: prop.s, size: prop.size };
  if (prop.t === "line") return { kind: "line", points: prop.pts, width };
  if (prop.t === "dot")
    return { kind: "shape", points: circlePoints(prop.c, prop.r, 12), fill: "ink" };
  const fill =
    prop.fill === undefined
      ? null
      : prop.fill === "paper"
        ? STICK_PAPER
        : prop.fill === "warn"
          ? tint === "color"
            ? STICK_WARN_FILL
            : STICK_MONO_FILL
          : tintFill(tint, prop.fill);
  const points =
    prop.t === "poly"
      ? prop.pts
      : prop.t === "rect"
        ? rectPoints(prop.x, prop.y, prop.w, prop.h)
        : circlePoints(prop.c, prop.r, 32);
  return { kind: "shape", points, width, fill };
}

function mirror(stroke: StickStroke, w: number): StickStroke {
  if (stroke.kind === "text") return { ...stroke, x: w - stroke.x };
  return { ...stroke, points: stroke.points.map(([x, y]): Vec => [w - x, y]) };
}

/**
 * 姿态 → 中间笔画（局部坐标 0..w × 0..h），按绘制顺序：
 * 下层道具 → 人物（多人按序号轮换着色）→ 上层道具 → 文字。
 * 翻转只镜像坐标，文字字形不镜像。
 */
export function buildStickStrokes(pose: StickPose, style: StickStyle): StickStroke[] {
  const { body, tint } = style;
  const props = pose.props ?? [];
  const isText = (p: StickProp) => p.t === "text";
  const strokes: StickStroke[] = [
    ...props.filter(p => !isText(p) && !("z" in p && p.z)).map(p => propStroke(p, body, tint)),
    ...pose.people.flatMap((person, i) => personStrokes(person, body, tint, i)),
    ...props.filter(p => !isText(p) && "z" in p && p.z).map(p => propStroke(p, body, tint)),
    ...props.filter(isText).map(p => propStroke(p, body, tint)),
  ];
  return style.flip ? strokes.map(s => mirror(s, pose.w)) : strokes;
}
