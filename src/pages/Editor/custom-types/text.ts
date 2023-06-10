export interface FormattedText {
  type: 'formatted';
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  highlight?: boolean;
  code?: boolean;
}