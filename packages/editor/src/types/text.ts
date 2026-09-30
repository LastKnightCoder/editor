import type { TextGradientPresetId } from "../constants/text-gradient";

import type { InlinePaletteColor } from "../constants/inline-palette";

export type HighlightColor = InlinePaletteColor;

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
