import type { WeReadColorStyle } from "./types/elements";

/**
 * 微信读书高亮颜色配置
 * colorStyle: 1=红色, 2=紫色, 3=蓝色, 4=绿色, 5=黄色
 */
export const wereadColors: Record<
  WeReadColorStyle,
  {
    name: string;
    light: { backgroundColor: string; borderColor: string; textColor: string };
    dark: { backgroundColor: string; borderColor: string; textColor: string };
  }
> = {
  1: {
    // 红色
    name: "红色",
    light: {
      backgroundColor: "#fef1f1",
      borderColor: "#fde2e2",
      textColor: "#dc2626",
    },
    dark: {
      backgroundColor: "rgba(240, 91, 86, 0.22)",
      borderColor: "rgba(240, 91, 86, 0.36)",
      textColor: "#f87171",
    },
  },
  2: {
    // 紫色
    name: "紫色",
    light: {
      backgroundColor: "#f6f1fe",
      borderColor: "#ece2fe",
      textColor: "#9333ea",
    },
    dark: {
      backgroundColor: "rgba(151, 98, 245, 0.24)",
      borderColor: "rgba(151, 98, 245, 0.4)",
      textColor: "#c084fc",
    },
  },
  3: {
    // 蓝色
    name: "蓝色",
    light: {
      backgroundColor: "#f0f4ff",
      borderColor: "#e1eaff",
      textColor: "#2563eb",
    },
    dark: {
      backgroundColor: "rgba(76, 136, 255, 0.21)",
      borderColor: "rgba(76, 136, 255, 0.35)",
      textColor: "#60a5fa",
    },
  },
  4: {
    // 绿色
    name: "绿色",
    light: {
      backgroundColor: "#f0fbef",
      borderColor: "#d1fae5",
      textColor: "#16a34a",
    },
    dark: {
      backgroundColor: "rgba(84, 194, 72, 0.22)",
      borderColor: "rgba(84, 194, 72, 0.36)",
      textColor: "#4ade80",
    },
  },
  5: {
    // 黄色
    name: "黄色",
    light: {
      backgroundColor: "#fefce8",
      borderColor: "#fef08a",
      textColor: "#ca8a04",
    },
    dark: {
      backgroundColor: "rgba(245, 226, 49, 0.18)",
      borderColor: "rgba(245, 226, 49, 0.28)",
      textColor: "#facc15",
    },
  },
};

/**
 * 无高亮时的灰色配置
 */
export const noHighlightColor = {
  light: {
    backgroundColor: "#f5f5f5",
    borderColor: "#e5e5e5",
    textColor: "#525252",
  },
  dark: {
    backgroundColor: "rgba(115, 115, 115, 0.2)",
    borderColor: "rgba(115, 115, 115, 0.35)",
    textColor: "#a3a3a3",
  },
};

/**
 * 根据 colorStyle 获取颜色配置
 */
export const getWeReadColor = (
  colorStyle: WeReadColorStyle | undefined,
  isDark: boolean,
) => {
  if (!colorStyle || colorStyle < 1 || colorStyle > 5) {
    return isDark ? noHighlightColor.dark : noHighlightColor.light;
  }
  const color = wereadColors[colorStyle];
  return isDark ? color.dark : color.light;
};

/**
 * 高亮样式名称
 * style: 0=下划线, 1=背景高亮(马克笔), 2=波浪线
 */
export const highlightStyleNames: Record<0 | 1 | 2, string> = {
  0: "下划线",
  1: "马克笔",
  2: "波浪线",
};

/**
 * 高亮样式图标（用于悬浮菜单）
 */
export const highlightStyleIcons: Record<0 | 1 | 2, string> = {
  0: "underline",
  1: "highlight",
  2: "wave",
};
