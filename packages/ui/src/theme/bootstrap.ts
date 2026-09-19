import { getThemeRegistry } from "./defineTheme";
import "./themes";

export const DEFAULT_LIGHT_KEY = "cream";
export const DEFAULT_DARK_KEY = "cocoa";
export const THEME_STORAGE_KEY = "tau-theme";
export interface ThemeRuntimeConfig {
  light: string;
  dark: string;
  storageKey: string;
  themes: Record<string, "light" | "dark">;
}
export function themeRuntimeConfig(
  overrides: Partial<Omit<ThemeRuntimeConfig, "themes">> = {}
): ThemeRuntimeConfig {
  return {
    light: DEFAULT_LIGHT_KEY,
    dark: DEFAULT_DARK_KEY,
    storageKey: THEME_STORAGE_KEY,
    ...overrides,
    themes: Object.fromEntries([...getThemeRegistry()].map(([key, value]) => [key, value.mode])),
  };
}
export function resolveThemePreference(
  mode: string | null,
  prefersDark: boolean,
  config: ThemeRuntimeConfig
): string {
  if (mode === "system") return prefersDark ? config.dark : config.light;
  return mode && Object.prototype.hasOwnProperty.call(config.themes, mode) ? mode : config.light;
}
export function createThemeBootstrapScript(config = themeRuntimeConfig()): string {
  const serialized = JSON.stringify(config).replace(/</g, "\\u003c");
  return `(function(config,resolve){var mode=null;try{mode=localStorage.getItem(config.storageKey)}catch(e){}var key=resolve(mode,typeof matchMedia==="function"&&matchMedia("(prefers-color-scheme: dark)").matches,config);var root=document.documentElement;root.dataset.theme=key;root.style.colorScheme=config.themes[key];root.classList.toggle("dark",config.themes[key]==="dark")})(${serialized},${resolveThemePreference.toString()});`;
}
