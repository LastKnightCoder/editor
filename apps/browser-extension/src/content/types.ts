export interface SerializedRange {
  startXPath: string;
  startOffset: number;
  endXPath: string;
  endOffset: number;
  text: string;
}

export type HighlightStyle = "marker" | "wavy" | "straight" | "dashed";
export type HighlightColor = "pink" | "purple" | "blue" | "green" | "orange";

export interface Highlight {
  id: string;
  range: SerializedRange;
  style: HighlightStyle;
  color: HighlightColor;
  createdAt: number;
}

export interface Annotation {
  highlightId: string;
  text: string;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PageHighlights {
  url: string;
  highlights: Highlight[];
  annotations: Record<string, Annotation>;
  version: 1;
}

export const HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  pink: "#f472b6",
  purple: "#a78bfa",
  blue: "#60a5fa",
  green: "#4ade80",
  orange: "#fb923c",
};

export const HIGHLIGHT_BG_COLORS: Record<HighlightColor, string> = {
  pink: "rgba(244, 114, 182, 0.3)",
  purple: "rgba(167, 139, 250, 0.3)",
  blue: "rgba(96, 165, 250, 0.3)",
  green: "rgba(74, 222, 128, 0.3)",
  orange: "rgba(251, 146, 60, 0.3)",
};

// 暗色背景下使用更高透明度，确保高亮可见
export const HIGHLIGHT_BG_COLORS_DARK: Record<HighlightColor, string> = {
  pink: "rgba(244, 114, 182, 0.45)",
  purple: "rgba(167, 139, 250, 0.45)",
  blue: "rgba(96, 165, 250, 0.45)",
  green: "rgba(74, 222, 128, 0.45)",
  orange: "rgba(251, 146, 60, 0.45)",
};

// 暗色背景下使用更亮的下划线颜色（Tailwind 300 色阶）
export const HIGHLIGHT_COLORS_DARK: Record<HighlightColor, string> = {
  pink: "#f9a8d4",
  purple: "#c4b5fd",
  blue: "#93c5fd",
  green: "#86efac",
  orange: "#fdba74",
};

export const HIGHLIGHT_COLOR_ORDER: HighlightColor[] = [
  "pink",
  "purple",
  "blue",
  "green",
  "orange",
];

export const DEFAULT_COLOR: HighlightColor = HIGHLIGHT_COLOR_ORDER[0] ?? "pink";
export const DEFAULT_STYLE: HighlightStyle = "marker";

export const STORAGE_KEY_PREFIX = "tau-highlights:";
