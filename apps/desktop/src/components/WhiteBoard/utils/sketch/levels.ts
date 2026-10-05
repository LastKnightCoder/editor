import type { SketchLevel } from "../../types/sketch";

/** 各档位沿法线摆动的幅度（px） */
export const WOBBLE_AMPLITUDE: Record<SketchLevel, number> = {
  neat: 0.55,
  natural: 1.3,
  loose: 2.6,
};

/** 墨迹宽度：比描边线宽略粗，补偿两端渐细后的视觉重量 */
export const inkSize = (strokeWidth: number) => strokeWidth * 1.3 + 0.5;
