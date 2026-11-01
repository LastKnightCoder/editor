import type { TextGradientPresetId } from "./text-gradient.ts";

export type HighlightColor = "gray" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
/** 背景高亮的笔触：宿主级外观，不写进文档 */
export type HighlightStyle = "flat" | "chisel" | "swipe" | "grain";

export const HIGHLIGHT_STYLES: readonly { id: HighlightStyle; label: string }[] = [
  { id: "flat", label: "平涂" },
  { id: "chisel", label: "平头荧光笔" },
  { id: "swipe", label: "下半划线" },
  { id: "grain", label: "干笔颗粒" },
];

export const isHighlightStyle = (value: unknown): value is HighlightStyle =>
  HIGHLIGHT_STYLES.some(style => style.id === value);
export type Mark =
  | "bold"
  | "italic"
  | "code"
  | "underline"
  | "highlight"
  | "strikethrough"
  | "color";

export const TEXT_FORMATTING_KEYS = [
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "code",
  "highlight",
  "color",
  "darkColor",
  "textGradient",
] as const;

declare module "@tau/markdown/model" {
  interface TextMarkMap {
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
}
