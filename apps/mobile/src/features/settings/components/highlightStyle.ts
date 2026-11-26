import {
  isHighlightStyle,
  type HighlightStyle,
} from "@tau/editor/extensions/text-formatting/types";

/** 未设置或未知值回落平涂，与编辑器渲染口径一致 */
export function normalizeHighlightStyle(value: unknown): HighlightStyle {
  return isHighlightStyle(value) ? value : "flat";
}
