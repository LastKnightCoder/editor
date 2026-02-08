export interface SerializedRange {
  startXPath: string;
  startOffset: number;
  endXPath: string;
  endOffset: number;
  text: string;
}

export type HighlightStyle = "marker" | "wavy" | "straight";
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

export const DEFAULT_COLOR: HighlightColor = "blue";
export const DEFAULT_STYLE: HighlightStyle = "marker";

export const STORAGE_KEY_PREFIX = "tau-highlights:";
