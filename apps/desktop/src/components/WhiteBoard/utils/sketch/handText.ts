import type { ResolvedSketch, SketchLevel } from "../../types/sketch";

/**
 * Shantell Sans 是可变字体：默认实例偏细（wght 300）统一取 480，
 * 随性度（INFM 轴）跟笔触档位联动。小赖 SC 不是可变字体，忽略这些设置。
 */
const HAND_FONT_CLASS: Record<SketchLevel, string> = {
  neat: "font-tau-hand [font-variation-settings:'wght'_480,'INFM'_0]",
  natural: "font-tau-hand [font-variation-settings:'wght'_480,'INFM'_40]",
  loose: "font-tau-hand [font-variation-settings:'wght'_480,'INFM'_90]",
};

/** 手绘文字容器的类名（D-107）；未启用手绘时为空串 */
export const handTextClass = (sketch: ResolvedSketch) =>
  sketch.enabled ? HAND_FONT_CLASS[sketch.level] : "";
