/**
 * Notion 颜色映射模块
 *
 * 本地编辑器使用固定的 7 种颜色配置，可以完美映射到 Notion 颜色
 */

export const COLOR_MAP = {
  // 本地 hex → Notion 颜色名
  hexToNotion: {
    "#8f959e": "gray", // 灰色 light
    "#757575": "gray", // 灰色 dark
    "#e33a32": "red", // 红色 light
    "#fa7873": "red", // 红色 dark
    "#e57d05": "orange", // 橙色 light
    "#f5a54a": "orange", // 橙色 dark
    "#dc9b04": "yellow", // 黄色 light
    "#fcd456": "yellow", // 黄色 dark
    "#2ea121": "green", // 绿色 light
    "#6dd162": "green", // 绿色 dark
    "#245bdb": "blue", // 蓝色 light
    "#70a0ff": "blue", // 蓝色 dark
    "#6425d0": "purple", // 紫色 light
    "#a472fc": "purple", // 紫色 dark
  } as Record<string, string>,

  // Notion 颜色名 → 本地 hex (light, dark)
  notionToHex: {
    gray: { light: "#8f959e", dark: "#757575" },
    red: { light: "#e33a32", dark: "#fa7873" },
    orange: { light: "#e57d05", dark: "#f5a54a" },
    yellow: { light: "#dc9b04", dark: "#fcd456" },
    green: { light: "#2ea121", dark: "#6dd162" },
    blue: { light: "#245bdb", dark: "#70a0ff" },
    purple: { light: "#6425d0", dark: "#a472fc" },
    // Notion 额外的颜色回退映射
    brown: { light: "#e57d05", dark: "#f5a54a" }, // → 橙色
    pink: { light: "#e33a32", dark: "#fa7873" }, // → 红色
  } as Record<string, { light: string; dark: string }>,
};

/**
 * 将本地 hex 颜色转换为 Notion 颜色名
 */
export function hexToNotionColor(hex: string | undefined): string {
  if (!hex) return "default";
  return COLOR_MAP.hexToNotion[hex.toLowerCase()] || "default";
}

/**
 * 将 Notion 颜色名转换为本地 hex 颜色
 */
export function notionColorToHex(notionColor: string): {
  light?: string;
  dark?: string;
} {
  if (!notionColor || notionColor === "default") {
    return { light: undefined, dark: undefined };
  }

  // 移除 _background 后缀（如果有）
  const baseColor = notionColor.replace("_background", "");
  return (
    COLOR_MAP.notionToHex[baseColor] || { light: undefined, dark: undefined }
  );
}
