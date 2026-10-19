import type { TextGradientPresetId } from "./text-gradient.ts";

export type HighlightColor = "gray" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
export type Mark =
  "bold" | "italic" | "code" | "underline" | "highlight" | "strikethrough" | "color";

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
