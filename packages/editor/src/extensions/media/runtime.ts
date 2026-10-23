// 宿主在编辑器外驱动媒体块的运行时能力（触屏工具栏等），只对已渲染的元素有效
import type { Element } from "slate";
import { mediaWidthControls } from "./src/utils/mediaWidthControls.ts";

export type { MediaWidthControl } from "./src/utils/mediaWidthControls.ts";
export { matchMediaWidthPreset } from "./src/utils/mediaWidthControls.ts";
export { WIDTH_PRESETS } from "./src/utils/mediaWidth.ts";
export const getMediaWidthControl = (element: Element) => mediaWidthControls.get(element);
