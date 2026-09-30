import type { FormattedText } from "./model.ts";
export type { FormattedText, HighlightColor } from "./model.ts";

/** 框架只看树结构；具体元素的字段和类型由 codec 解释。 */
export interface CustomElement {
  type: string;
  children: Array<CustomElement | FormattedText>;
}

export const isFormattedText = (node: CustomElement | FormattedText): node is FormattedText =>
  node.type === "formatted";
