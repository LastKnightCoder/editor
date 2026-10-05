/** 页面画风：手绘 / 普通（D-106） */
export type SketchMode = "sketch" | "normal";

/** 笔触档位：工整 / 自然 / 潦草 */
export type SketchLevel = "neat" | "natural" | "loose";

/** 形状填充样式；普通模式下一律按实色渲染 */
export type SketchFillStyle = "solid" | "hatch" | "cross" | "scribble";

/** 页级画风，存在 WhiteBoardContent.data.sketch，缺省为 DEFAULT_PAGE_SKETCH */
export interface PageSketch {
  mode: SketchMode;
  level: SketchLevel;
}

/** 元素级覆盖；未设置的字段跟随页面 */
export interface ElementSketch {
  mode?: SketchMode;
  level?: SketchLevel;
  /** 「换一笔」写入；缺省时由元素 id 派生 */
  seed?: number;
}

export const DEFAULT_PAGE_SKETCH: PageSketch = { mode: "normal", level: "natural" };

/** 生效画风：页面默认值与元素覆盖合成后的结果 */
export interface ResolvedSketch {
  enabled: boolean;
  level: SketchLevel;
  seed: number;
}
