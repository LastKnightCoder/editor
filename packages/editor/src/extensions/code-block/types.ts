export interface CodeCursorPosition {
  line: number;
  ch: number;
}

export interface CodeBlockController {
  focus: () => void;
  getValue: () => string;
  setValue: (value: string) => void;
  getCursor: () => CodeCursorPosition;
  setCursor: (cursor: CodeCursorPosition) => void;
  getLine: (line: number) => string;
  lastLine: () => number;
}
