export enum EHighlightType {
  Text = 'text',
  Area = 'area',
}

export enum EHighlightTextStyle {
  Highlight = 'highlight',
  Underline = 'underline',
  Wave = 'wave',
}

export enum EHighlightColor {
  Red = 'red',
  Blue = 'blue',
  Green = 'green',
  Yellow = 'yellow',
  Purple = 'purple',
  Pink = 'pink',
}

export const HIGHLIGHT_COLOR_CLASS_NAMES = {
  [EHighlightColor.Red]: 'pdf-highlight-red',
  [EHighlightColor.Blue]: 'pdf-highlight-blue',
  [EHighlightColor.Green]: 'pdf-highlight-green',
  [EHighlightColor.Yellow]: 'pdf-highlight-yellow',
  [EHighlightColor.Purple]: 'pdf-highlight-purple',
  [EHighlightColor.Pink]: 'pdf-highlight-pink',
}