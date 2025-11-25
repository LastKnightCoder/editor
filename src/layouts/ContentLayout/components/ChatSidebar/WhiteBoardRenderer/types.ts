export type ParsedElementType =
  | "rect"
  | "circle"
  | "ellipse"
  | "diamond"
  | "text"
  | "arrow"
  | "frame"
  | "image";

// 颜色关键字类型
export type ColorKeyword =
  | "blue"
  | "green"
  | "yellow"
  | "orange"
  | "red"
  | "purple"
  | "gray"
  | "cyan"
  | "pink";

export interface ParsedBaseElement {
  id: string;
  type: ParsedElementType;
}

export interface ParsedGeometryElement extends ParsedBaseElement {
  type: "rect" | "circle" | "ellipse" | "diamond";
  x: number;
  y: number;
  width: number;
  height: number;
  color?: ColorKeyword; // 颜色关键字
  text?: string;
}

export interface ParsedTextElement extends ParsedBaseElement {
  type: "text";
  x: number;
  y: number;
  width?: number;
  height?: number;
  text: string;
  color?: ColorKeyword;
}

export interface ParsedImageElement extends ParsedBaseElement {
  type: "image";
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
}

export type ArrowEndpoint = string | [number, number]; // elementId.position or [x, y]

export interface ParsedArrowElement extends ParsedBaseElement {
  type: "arrow";
  from: ArrowEndpoint;
  to: ArrowEndpoint;
  color?: ColorKeyword;
  marker?: "none" | "arrow" | "diamond" | "circle";
  dashed?: boolean;
}

export interface ParsedFrameElement extends ParsedBaseElement {
  type: "frame";
  x: number;
  y: number;
  width: number;
  height: number;
  title?: string;
  color?: ColorKeyword;
}

export type ParsedElement =
  | ParsedGeometryElement
  | ParsedTextElement
  | ParsedImageElement
  | ParsedArrowElement
  | ParsedFrameElement;

export interface WhiteboardYAML {
  elements: ParsedElement[];
}

// 颜色配置 - 支持浅色/深色模式
export interface ColorConfig {
  fill: string;
  stroke: string;
  text: string;
}

export interface ThemeColors {
  light: ColorConfig;
  dark: ColorConfig;
}

// 预定义颜色映射
export const COLOR_PRESETS: Record<ColorKeyword, ThemeColors> = {
  blue: {
    light: {
      fill: "rgba(59, 130, 246, 0.15)",
      stroke: "#3b82f6",
      text: "#1e40af",
    },
    dark: {
      fill: "rgba(59, 130, 246, 0.25)",
      stroke: "#60a5fa",
      text: "#93c5fd",
    },
  },
  green: {
    light: {
      fill: "rgba(16, 185, 129, 0.15)",
      stroke: "#10b981",
      text: "#065f46",
    },
    dark: {
      fill: "rgba(16, 185, 129, 0.25)",
      stroke: "#34d399",
      text: "#6ee7b7",
    },
  },
  yellow: {
    light: {
      fill: "rgba(253, 224, 71, 0.2)",
      stroke: "#eab308",
      text: "#854d0e",
    },
    dark: {
      fill: "rgba(253, 224, 71, 0.25)",
      stroke: "#fde047",
      text: "#fef08a",
    },
  },
  orange: {
    light: {
      fill: "rgba(245, 158, 11, 0.15)",
      stroke: "#f59e0b",
      text: "#92400e",
    },
    dark: {
      fill: "rgba(245, 158, 11, 0.25)",
      stroke: "#fbbf24",
      text: "#fcd34d",
    },
  },
  red: {
    light: {
      fill: "rgba(239, 68, 68, 0.15)",
      stroke: "#ef4444",
      text: "#991b1b",
    },
    dark: {
      fill: "rgba(239, 68, 68, 0.25)",
      stroke: "#f87171",
      text: "#fca5a5",
    },
  },
  purple: {
    light: {
      fill: "rgba(139, 92, 246, 0.15)",
      stroke: "#8b5cf6",
      text: "#5b21b6",
    },
    dark: {
      fill: "rgba(139, 92, 246, 0.25)",
      stroke: "#a78bfa",
      text: "#c4b5fd",
    },
  },
  gray: {
    light: {
      fill: "rgba(107, 114, 128, 0.15)",
      stroke: "#6b7280",
      text: "#374151",
    },
    dark: {
      fill: "rgba(107, 114, 128, 0.25)",
      stroke: "#9ca3af",
      text: "#d1d5db",
    },
  },
  cyan: {
    light: {
      fill: "rgba(6, 182, 212, 0.15)",
      stroke: "#06b6d4",
      text: "#155e75",
    },
    dark: {
      fill: "rgba(6, 182, 212, 0.25)",
      stroke: "#22d3ee",
      text: "#67e8f9",
    },
  },
  pink: {
    light: {
      fill: "rgba(236, 72, 153, 0.15)",
      stroke: "#ec4899",
      text: "#9d174d",
    },
    dark: {
      fill: "rgba(236, 72, 153, 0.25)",
      stroke: "#f472b6",
      text: "#f9a8d4",
    },
  },
};

// 默认颜色
export const DEFAULT_COLOR: ColorKeyword = "blue";

// 获取颜色配置
export function getColorConfig(
  color: ColorKeyword | undefined,
  isDark: boolean,
): ColorConfig {
  const colorKey = color && COLOR_PRESETS[color] ? color : DEFAULT_COLOR;
  return isDark ? COLOR_PRESETS[colorKey].dark : COLOR_PRESETS[colorKey].light;
}
