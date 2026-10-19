/** 手绘算法用到的白板类型（摘自 packages/whiteboard/src/types/sketch.ts、types/arrow.ts） */
export type SketchLevel = "neat" | "natural" | "loose";
export type SketchFillStyle = "solid" | "hatch" | "cross" | "scribble";

export enum EMarkerType {
  None = "none",
  Arrow = "arrow",
  OpenArrow = "open-arrow",
  ClosedArrow = "closed-arrow",
  Diamond = "diamond",
  Circle = "circle",
}
