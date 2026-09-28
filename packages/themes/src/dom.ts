/**
 * 主题的 DOM 应用：把「主题族 × 明暗」写到 <html data-theme data-mode>（+ color-scheme
 * + 深色 .dark 类），token 取值由 tokens.css 的 [data-theme][data-mode] 数据块级联。
 * 偏好持久化、system 跟随在 `@tau/themes/react`；首帧由 createThemeBootstrapScript 预置属性。
 */
import { getTheme, type ThemeMode } from "./defineTheme";
import { isDev } from "./env";
import "./register";

export function applyThemeToDom(
  key: string,
  mode: ThemeMode,
  root: HTMLElement = document.documentElement
): void {
  if (!getTheme(key)) {
    if (isDev()) console.warn(`[theme] 未注册主题「${key}」`);
    return;
  }
  root.dataset.theme = key;
  root.dataset.mode = mode;
  root.style.colorScheme = mode;
  // 编辑器包的 dark: 变体依赖 .dark 类
  root.classList.toggle("dark", mode === "dark");
}
