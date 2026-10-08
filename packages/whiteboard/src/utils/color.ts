/**
 * 白板颜色工具函数
 */

import { ArrowElement } from "../types";
import { getThemeColorById, getDefaultThemeColorId } from "../constants/theme-colors";

/**
 * 根据箭头元素和当前主题获取实际显示颜色
 * @param element 箭头元素
 * @param isDark 是否为深色模式
 * @returns 实际显示的颜色值
 */
export function getArrowDisplayColor(element: ArrowElement, isDark: boolean): string {
  // 优先使用主题颜色
  const themeColorId = element.themeColorId || getDefaultThemeColorId();
  const colorPair = getThemeColorById(themeColorId);

  if (colorPair) {
    return isDark ? colorPair.dark : colorPair.light;
  }

  // 如果找不到主题颜色，使用默认黑白主题色
  return isDark ? "#e5e5e5" : "#1a1a1a";
}

/**
 * 将十六进制颜色转换为 HSL
 * @param hex 十六进制颜色，如 "#3b82f6"
 * @returns HSL 对象 { h, s, l }
 */
export function hexToHSL(hex: string): { h: number; s: number; l: number } {
  // 移除 # 号
  const sanitizedHex = hex.replace("#", "");

  // 解析 RGB 值
  const r = parseInt(sanitizedHex.substring(0, 2), 16) / 255;
  const g = parseInt(sanitizedHex.substring(2, 4), 16) / 255;
  const b = parseInt(sanitizedHex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100) / 100,
    l: Math.round(l * 100) / 100,
  };
}

/**
 * 将 HSL 转换为十六进制颜色
 * @param h 色相 (0-360)
 * @param s 饱和度 (0-1)
 * @param l 亮度 (0-1)
 * @returns 十六进制颜色字符串
 */
export function hslToHex(h: number, s: number, l: number): string {
  const hue = h / 360;

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  const r = hueToRgb(p, q, hue + 1 / 3);
  const g = hueToRgb(p, q, hue);
  const b = hueToRgb(p, q, hue - 1 / 3);

  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hueToRgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

/**
 * 智能调整颜色以适应主题
 * 在深色模式下提高亮度，在浅色模式下降低亮度
 * @param color 原始颜色
 * @param isDark 是否为深色模式
 * @returns 调整后的颜色
 */
export function adaptColorToTheme(color: string, isDark: boolean): string {
  const { h, s, l } = hexToHSL(color);

  let newL = l;
  if (isDark) {
    // 深色模式：提高亮度，确保可见性
    newL = Math.max(l, 0.5); // 最低亮度 50%
  } else {
    // 浅色模式：适当降低亮度，避免过亮
    newL = Math.min(l, 0.6); // 最高亮度 60%
  }

  return hslToHex(h, s, newL);
}
