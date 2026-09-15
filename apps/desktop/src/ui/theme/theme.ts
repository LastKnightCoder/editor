/**
 * 主题运行时（薄层）：
 *  - applyTheme：切换 <html data-theme> 并持久化 key，token 取值由 tokens.css 的
 *    [data-theme] 数据块级联（D-009：data-theme + CSS variables 零 JS 切换）；
 *  - initTheme：AppShell 挂载时调用一次（当前单主题直启 cream）；
 *  - index.html 的内联脚本会在 React 加载前按 localStorage 预置 data-theme（首帧无闪变）。
 *
 * 后续扩展（接线点见 03 指南）：mode: system/light/dark 持久化、prefers-color-scheme
 * 跟随、多主题切换、构建期 codegen 生成数据块（协议不变）。
 */

import { getTheme } from "./defineTheme";
import "./themes"; // 副作用注册全部主题（glob 收集后可移除显式 import）

export const DEFAULT_THEME_KEY = "cream";
export const THEME_STORAGE_KEY = "tau-theme";

export function applyTheme(key: string): void {
  const theme = getTheme(key);
  if (!theme) {
    if (import.meta.env.DEV) {
      console.warn(`[theme] 未注册主题「${key}」，回退默认主题`);
    }
    return;
  }
  const root = document.documentElement;
  root.dataset.theme = theme.key;
  root.style.colorScheme = theme.mode;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme.key);
  } catch {
    // 隐私模式等存储不可用时静默降级（下次启动仍走默认主题）
  }
}

export function initTheme(): void {
  applyTheme(DEFAULT_THEME_KEY);
}
