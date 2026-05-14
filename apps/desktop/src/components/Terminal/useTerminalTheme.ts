import { useMemo } from "react";
import type { ITheme } from "@xterm/xterm";
import useTheme from "@/hooks/useTheme";

const DARK_THEME: ITheme = {
  background: "#1f1f1f",
  foreground: "#d4d4d4",
  cursor: "#aeafad",
  cursorAccent: "#1a1a1a",
  selectionBackground: "#264f7844",
  selectionForeground: "#d4d4d4",
  black: "#1e1e1e",
  red: "#f44747",
  green: "#6a9955",
  yellow: "#d7ba7d",
  blue: "#569cd6",
  magenta: "#c586c0",
  cyan: "#4ec9b0",
  white: "#d4d4d4",
  brightBlack: "#808080",
  brightRed: "#f44747",
  brightGreen: "#6a9955",
  brightYellow: "#d7ba7d",
  brightBlue: "#569cd6",
  brightMagenta: "#c586c0",
  brightCyan: "#4ec9b0",
  brightWhite: "#e5e5e5",
};

const LIGHT_THEME: ITheme = {
  background: "#ffffff",
  foreground: "#383a42",
  cursor: "#526eff",
  cursorAccent: "#ffffff",
  selectionBackground: "#add6ff80",
  selectionForeground: "#383a42",
  black: "#383a42",
  red: "#e45649",
  green: "#50a14f",
  yellow: "#c18401",
  blue: "#4078f2",
  magenta: "#a626a4",
  cyan: "#0184bc",
  white: "#a0a1a7",
  brightBlack: "#4f525e",
  brightRed: "#e06c75",
  brightGreen: "#98c379",
  brightYellow: "#e5c07b",
  brightBlue: "#61afef",
  brightMagenta: "#c678dd",
  brightCyan: "#56b6c2",
  brightWhite: "#ffffff",
};

const useTerminalTheme = (): ITheme => {
  const { isDark } = useTheme();
  return useMemo(() => (isDark ? DARK_THEME : LIGHT_THEME), [isDark]);
};

export default useTerminalTheme;
