import type { Vec } from "../sketch/geometry";

export type { Vec };

/** 形体：经典（线条）/ 豆豆（胶囊身体可着色）/ 象形（粗线实心头） */
export type StickBody = "classic" | "bean" | "glyph";

/** 着色：单色（墨色 + 浅灰填充）/ 点缀（主色与标签色轮换） */
export type StickTint = "mono" | "color";

export type StickCategory = "basic" | "mood" | "work" | "metaphor" | "group";

/** 一个人物的关节：头心 h / 颈 n / 髋 p，四肢为 [肘或膝, 手或脚] */
export interface StickPersonJoints {
  h: Vec;
  n: Vec;
  p: Vec;
  la: [Vec, Vec];
  ra: [Vec, Vec];
  ll: [Vec, Vec];
  rl: [Vec, Vec];
}

export interface StickPerson extends StickPersonJoints {
  /** 豆豆形体躯干占位大，部分姿态需要单独的关节坐标 */
  bean?: Partial<StickPersonJoints>;
}

/** 道具填充：纸色（只遮挡）/ 暖色（灯泡）/ 着色序号（点缀模式下按序号取主色、标签色） */
export type StickPropFill = "paper" | "warn" | number;

/** 道具层级：缺省画在人物之后的下层（back），front 盖在人物上 */
type Layer = { z?: "front" };

export type StickProp =
  | ({ t: "line"; pts: Vec[] } & Layer)
  | ({ t: "poly"; pts: Vec[]; fill?: StickPropFill } & Layer)
  | ({ t: "rect"; x: number; y: number; w: number; h: number; fill?: StickPropFill } & Layer)
  | ({ t: "circle"; c: Vec; r: number; fill?: StickPropFill } & Layer)
  | ({ t: "dot"; c: Vec; r: number } & Layer)
  | { t: "text"; x: number; y: number; s: string; size: number };

/** 姿态：坐标系为 w×h 的局部画布 */
export interface StickPose {
  key: string;
  name: string;
  cat: StickCategory;
  w: number;
  h: number;
  people: StickPerson[];
  props?: StickProp[];
}

/** 渲染前的中间笔画：与普通 / 手绘画风无关 */
export type StickStroke =
  | { kind: "line"; points: Vec[]; width: number }
  /** fill 为 CSS 颜色；"ink" 为实心墨；width 缺省则不描边 */
  | { kind: "shape"; points: Vec[]; width?: number; fill: string | null }
  | { kind: "text"; x: number; y: number; text: string; size: number };

export interface StickStyle {
  body: StickBody;
  tint: StickTint;
  flip?: boolean;
}
