/**
 * 主题运行时（薄层）：
 *  - applyThemeToDom：把「主题族 × 明暗」应用到 <html data-theme data-mode>（+ color-scheme
 *    + 深色 .dark 类），token 取值由 tokens.css 的 [data-theme][data-mode] 数据块级联
 *    （data 属性 + CSS variables 零 JS 切换）；
 *  - 偏好持久化、system 跟随、多主题枚举在 themeStore.ts（02 规范 §2.4）；
 *  - index.html 的内联脚本会在 React 加载前按 localStorage 预置属性（首帧无闪变）。
 */

import { getTheme, type ThemeMode } from "./defineTheme";
import "./themes"; // 副作用注册全部主题（glob 收集后可移除显式 import）

export {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_THEME_KEY,
  THEME_STORAGE_KEY,
  type Appearance,
} from "./bootstrap";

export function applyThemeToDom(
  key: string,
  mode: ThemeMode,
  root: HTMLElement = document.documentElement
): void {
  if (!getTheme(key)) {
    if (import.meta.env.DEV) {
      console.warn(`[theme] 未注册主题「${key}」`);
    }
    return;
  }
  root.dataset.theme = key;
  root.dataset.mode = mode;
  root.style.colorScheme = mode;
  // 编辑器包的 dark: 变体依赖 .dark 类（同移动端玄夜的做法）
  root.classList.toggle("dark", mode === "dark");
}
