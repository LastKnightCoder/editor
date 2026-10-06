import { getThemeRegistry, type ThemeMode } from "./defineTheme.ts";
import "./register.ts";

/** 明暗偏好：固定浅色 / 固定深色 / 跟随系统（与主题族正交） */
export type Appearance = ThemeMode | "system";

export const DEFAULT_THEME_KEY = "paper";
export const DEFAULT_APPEARANCE: Appearance = "light";
export const THEME_STORAGE_KEY = "tau-theme";
export const APPEARANCE_STORAGE_KEY = "tau-appearance";

export interface ThemeRuntimeConfig {
  defaultTheme: string;
  defaultAppearance: Appearance;
  themeStorageKey: string;
  appearanceStorageKey: string;
  themes: string[];
}

export interface ResolvedThemePreference {
  theme: string;
  appearance: Appearance;
  mode: ThemeMode;
}

export function themeRuntimeConfig(
  overrides: Partial<Omit<ThemeRuntimeConfig, "themes">> = {}
): ThemeRuntimeConfig {
  return {
    defaultTheme: DEFAULT_THEME_KEY,
    defaultAppearance: DEFAULT_APPEARANCE,
    themeStorageKey: THEME_STORAGE_KEY,
    appearanceStorageKey: APPEARANCE_STORAGE_KEY,
    ...overrides,
    themes: [...getThemeRegistry().keys()],
  };
}

/**
 * 存储值 → 生效主题。首帧内联脚本经 toString() 内嵌本函数，必须自包含（不引用模块内其它符号）。
 */
export function resolveThemePreference(
  savedTheme: string | null,
  savedAppearance: string | null,
  prefersDark: boolean,
  config: ThemeRuntimeConfig
): ResolvedThemePreference {
  const theme =
    savedTheme && config.themes.indexOf(savedTheme) !== -1 ? savedTheme : config.defaultTheme;
  const appearance: Appearance =
    savedAppearance === "light" || savedAppearance === "dark" || savedAppearance === "system"
      ? savedAppearance
      : config.defaultAppearance;
  const mode: ThemeMode = appearance === "system" ? (prefersDark ? "dark" : "light") : appearance;
  return { theme, appearance, mode };
}

export function createThemeBootstrapScript(config = themeRuntimeConfig()): string {
  const serialized = JSON.stringify(config).replace(/</g, "\\u003c");
  return `(function(config,resolve){var theme=null,appearance=null;try{theme=localStorage.getItem(config.themeStorageKey);appearance=localStorage.getItem(config.appearanceStorageKey)}catch(e){}var r=resolve(theme,appearance,typeof matchMedia==="function"&&matchMedia("(prefers-color-scheme: dark)").matches,config);var root=document.documentElement;root.dataset.theme=r.theme;root.dataset.mode=r.mode;root.style.colorScheme=r.mode;root.classList.toggle("dark",r.mode==="dark")})(${serialized},${resolveThemePreference.toString()});`;
}
