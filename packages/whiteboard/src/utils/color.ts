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
