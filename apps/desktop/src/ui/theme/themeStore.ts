/**
 * 主题模式运行时（照搬移动端 themeStore 模式，见 02 规范 §2.4）：
 *  - mode：主题 key 或 "system"（跟随系统深浅色），持久化 localStorage；
 *  - resolved：实际生效的主题 key（system 时按 prefers-color-scheme 解析）；
 *  - DOM 应用走 theme.ts 的 applyThemeToDom（token 由 [data-theme] 块级联，零 JS 切换）。
 *
 * 首帧防闪：index.html 内联脚本在 React 前做同样的解析并预置 data-theme；
 * ThemeMode 联合与该脚本的 key 白名单是双源，新增主题时两处同步（codegen 落地后统一）。
 */

import { create } from "zustand";
import { getThemeRegistry } from "./defineTheme";
import { applyThemeToDom, DEFAULT_DARK_KEY, DEFAULT_LIGHT_KEY, THEME_STORAGE_KEY } from "./theme";
import "./themes"; // 副作用注册全部主题（theme.ts 也已 import，此处显式声明依赖）

// codegen 落地后改为从 themeRegistry.generated.ts 的清单派生
export type ThemeMode = "cream" | "cocoa" | "system";

function readStoredMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "system" || (saved && getThemeRegistry().has(saved))) return saved as ThemeMode;
  } catch {
    // 存储不可用时回退默认主题
  }
  return DEFAULT_LIGHT_KEY;
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveTheme(mode: ThemeMode): string {
  if (mode === "system") return systemPrefersDark() ? DEFAULT_DARK_KEY : DEFAULT_LIGHT_KEY;
  return mode;
}

interface ThemeState {
  mode: ThemeMode;
  resolved: string;
  setMode: (mode: ThemeMode) => void;
}

const storedMode = readStoredMode();

export const useThemeStore = create<ThemeState>(set => ({
  mode: storedMode,
  resolved: resolveTheme(storedMode),
  setMode: mode => {
    const resolved = resolveTheme(mode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // 存储不可用时仅本次会话生效
    }
    applyThemeToDom(resolved);
    set({ mode, resolved });
  },
}));

/** Titlebar 快捷入口的循环顺序：浅色 → 深色 → 跟随系统 */
export function nextMode(current: ThemeMode): ThemeMode {
  const order: ThemeMode[] = [DEFAULT_LIGHT_KEY, DEFAULT_DARK_KEY, "system"];
  const idx = order.indexOf(current);
  return order[(idx + 1) % order.length];
}

let listenerBound = false;

/**
 * AppShell 挂载时调用：把 resolved 应用到 DOM（幂等，可恢复 /legacy 往返时
 * useSyncTheme 对 data-theme 的覆写）+ 注册系统深浅色监听（仅 system 模式跟随，
 * 只注册一次）。
 */
export function initThemeRuntime(): void {
  if (typeof document === "undefined") return;

  applyThemeToDom(useThemeStore.getState().resolved);

  if (listenerBound || typeof matchMedia !== "function") return;
  listenerBound = true;
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (useThemeStore.getState().mode !== "system") return;
    const next = resolveTheme("system");
    applyThemeToDom(next);
    useThemeStore.setState({ resolved: next });
  });
}
