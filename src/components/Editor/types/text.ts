export type HighlightColor = "blue" | "yellow" | "green" | "red" | "purple";

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
}
