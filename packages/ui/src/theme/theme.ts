/**
 * 主题运行时（薄层）：
 *  - applyThemeToDom：把主题应用到 <html data-theme>（+ color-scheme + 深色 .dark 类），
 *    token 取值由 tokens.css 的 [data-theme] 数据块级联（data-theme + CSS variables
 *    零 JS 切换）；
 *  - mode 持久化、system 跟随、多主题枚举在 themeStore.ts（照搬移动端模式，02 规范 §2.4）；
 *  - index.html 的内联脚本会在 React 加载前按 localStorage 预置 data-theme（首帧无闪变）。
 */

import { getTheme } from "./defineTheme";
import "./themes"; // 副作用注册全部主题（glob 收集后可移除显式 import）

export { DEFAULT_LIGHT_KEY, DEFAULT_DARK_KEY, THEME_STORAGE_KEY } from "./bootstrap";

export function applyThemeToDom(key: string, root: HTMLElement = document.documentElement): void {
  const theme = getTheme(key);
  if (!theme) {
    if (import.meta.env.DEV) {
      console.warn(`[theme] 未注册主题「${key}」`);
    }
    return;
  }
  root.dataset.theme = theme.key;
  root.style.colorScheme = theme.mode;
  // 编辑器包的 dark: 变体依赖 .dark 类（同移动端玄夜的做法）
  root.classList.toggle("dark", theme.mode === "dark");
}
