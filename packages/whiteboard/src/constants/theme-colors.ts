/**
 * 白板箭头主题颜色预设
 * 每个颜色包含浅色和深色两个版本，确保在不同主题下都有良好的视觉效果
 */

export interface ThemeColorPair {
  id: string;
  label: string;
  light: string; // 浅色模式下的颜色
  dark: string; // 深色模式下的颜色
}

/**
 * 主题颜色预设列表
 * 颜色来源于项目的主题系统，确保与整体设计风格一致
 */
export const THEME_COLORS: ThemeColorPair[] = [
  {
    id: "primary",
    label: "主色调",
    light: "#3b82f6", // blue-500
    dark: "#60a5fa", // blue-400
  },
  {
    id: "success",
    label: "成功",
    light: "#10b981", // emerald-500
    dark: "#34d399", // emerald-400
  },
  {
    id: "warning",
    label: "警告",
    light: "#f59e0b", // amber-500
    dark: "#fbbf24", // amber-400
  },
  {
    id: "error",
    label: "错误",
    light: "#ef4444", // red-500
    dark: "#f87171", // red-400
  },
  {
    id: "purple",
    label: "紫色",
    light: "#9333ea", // purple-600
    dark: "#a855f7", // purple-500
  },
  {
    id: "pink",
    label: "粉色",
    light: "#db2777", // pink-600
    dark: "#ec4899", // pink-500
  },
  {
    id: "indigo",
    label: "靛蓝",
    light: "#4f46e5", // indigo-600
    dark: "#818cf8", // indigo-400
  },
  {
    id: "cyan",
    label: "青色",
    light: "#06b6d4", // cyan-500
    dark: "#22d3ee", // cyan-400
  },
  {
    id: "orange",
    label: "橙色",
    light: "#ea580c", // orange-600
    dark: "#f97316", // orange-500
  },
  {
    id: "lime",
    label: "柠檬绿",
    light: "#65a30d", // lime-600
    dark: "#a3e635", // lime-400
  },
  {
    id: "gray",
    label: "灰色",
    light: "#6b7280", // gray-500
    dark: "#9ca3af", // gray-400
  },
  {
    id: "neutral",
    label: "黑白",
    light: "#1f1f1f", // 深色
    dark: "#f5f5f5", // 浅色
  },
];

/**
 * 根据颜色ID获取颜色对
 */
export function getThemeColorById(id: string): ThemeColorPair | undefined {
  return THEME_COLORS.find(color => color.id === id);
}

/**
 * 获取默认主题颜色ID
 */
export function getDefaultThemeColorId(): string {
  return "primary";
}
