// 多主题运行时：杏子（默认浅色）/ 玄夜（深色）/ 薄荷 / 海盐 / 跟随系统。
// 生效方式：html[data-theme] + data-mode（light/dark，公共包按 @tau/themes 约定读取）
// + 深色主题（玄夜）同步 .dark 类（编辑器包的 dark: 变体依赖）。

import { create } from "zustand";

export const THEME_OPTIONS = [
  { id: "apricot", label: "杏子", desc: "默认", dark: false },
  { id: "midnight", label: "玄夜", desc: "深色", dark: true },
  { id: "mint", label: "薄荷", desc: "清新", dark: false },
  { id: "ocean", label: "海盐", desc: "沉静", dark: false },
] as const;

export type ThemeId = (typeof THEME_OPTIONS)[number]["id"];
export type ThemeMode = ThemeId | "system";

const THEME_IDS: ReadonlySet<string> = new Set(THEME_OPTIONS.map(t => t.id));
const STORAGE_KEY = "tau-mobile-theme";

function readStoredMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (THEME_IDS.has(saved) || saved === "system")) return saved as ThemeMode;
    if (saved === "dark" || saved === "nocturne") return "midnight"; // 兼容旧版存储
    if (saved === "light") return "apricot";
  } catch {
    // ignore
  }
  return "apricot";
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveTheme(mode: ThemeMode): ThemeId {
  if (mode === "system") return systemPrefersDark() ? "midnight" : "apricot";
  return mode;
}

export function isThemeDark(theme: ThemeId): boolean {
  return THEME_OPTIONS.find(t => t.id === theme)?.dark ?? false;
}

function applyThemeToDom(theme: ThemeId) {
  const root = document.documentElement;
  const apply = () => {
    const dark = isThemeDark(theme);
    root.dataset.theme = theme;
    root.dataset.mode = dark ? "dark" : "light";
    root.classList.toggle("dark", dark);
  };
  apply();
}

interface ThemeState {
  mode: ThemeMode;
  resolved: ThemeId;
  setMode: (mode: ThemeMode) => void;
}

const storedMode = readStoredMode();

export const useThemeStore = create<ThemeState>(set => ({
  mode: storedMode,
  resolved: resolveTheme(storedMode),
  setMode: mode => {
    const resolved = resolveTheme(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore
    }
    applyThemeToDom(resolved);
    set({ mode, resolved });
  },
}));

let initialized = false;

/** 挂载一次：兜底应用主题 + 监听系统偏好（仅 mode=system 时跟随） */
export function initThemeRuntime() {
  if (initialized || typeof document === "undefined") return;
  initialized = true;

  applyThemeToDom(useThemeStore.getState().resolved);

  if (typeof matchMedia !== "function") return;
  const mediaQuery = matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", () => {
    if (useThemeStore.getState().mode !== "system") return;
    const next = resolveTheme("system");
    applyThemeToDom(next);
    useThemeStore.setState({ resolved: next });
  });
}
