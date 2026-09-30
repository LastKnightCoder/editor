import type { TextGradientPresetId } from "./text-gradient.ts";

export type HighlightColor = "gray" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";

/** 富文本标记是序列化契约，渲染器与 headless 框架消费同一份定义。 */
export interface FormattedText {
  type: "formatted";
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  highlight?: boolean | HighlightColor;
  strikethrough?: boolean;
  code?: boolean;
  color?: string;
  darkColor?: string;
  textGradient?: TextGradientPresetId;
}
