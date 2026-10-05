import type { SketchFillStyle, SketchLevel, SketchMode } from "../types/sketch";

export const SKETCH_MODE_OPTIONS: { value: SketchMode; label: string }[] = [
  { value: "sketch", label: "手绘" },
  { value: "normal", label: "普通" },
];

export const SKETCH_LEVEL_OPTIONS: { value: SketchLevel; label: string }[] = [
  { value: "neat", label: "工整" },
  { value: "natural", label: "自然" },
  { value: "loose", label: "潦草" },
];

export const SKETCH_FILL_OPTIONS: { value: SketchFillStyle; label: string }[] = [
  { value: "solid", label: "淡涂" },
  { value: "hatch", label: "斜线" },
  { value: "cross", label: "交叉" },
  { value: "scribble", label: "涂鸦" },
];

export const sketchLevelLabel = (level: SketchLevel) =>
  SKETCH_LEVEL_OPTIONS.find(o => o.value === level)?.label ?? "";
