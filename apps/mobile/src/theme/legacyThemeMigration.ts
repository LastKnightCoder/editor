/**
 * 旧版移动端主题偏好（单键 tau-mobile-theme：杏子 / 玄夜 / 薄荷 / 海盐 / 跟随系统）
 * → @tau/themes 的主题族 × 明暗两键。首帧脚本前同步执行一次，迁移后删除旧键。
 */
import { APPEARANCE_STORAGE_KEY, THEME_STORAGE_KEY } from "@tau/themes";

export const LEGACY_THEME_STORAGE_KEY = "tau-mobile-theme";

const LEGACY_THEME_MAP: Record<string, [theme: string, appearance: string]> = {
  apricot: ["paper", "light"],
  light: ["paper", "light"],
  midnight: ["paper", "dark"],
  dark: ["paper", "dark"],
  nocturne: ["paper", "dark"],
  mint: ["mint", "light"],
  ocean: ["ocean", "light"],
  system: ["paper", "system"],
};

interface LegacyThemeKeys {
  legacy: string;
  theme: string;
  appearance: string;
  map: Record<string, [string, string]>;
}

/** 首帧内联脚本经 toString() 内嵌本函数，必须自包含（不引用模块内其它符号）。 */
export function migrateLegacyThemePreference(storage: Storage, keys: LegacyThemeKeys): void {
  const saved = storage.getItem(keys.legacy);
  if (saved === null) return;
  const target = keys.map[saved];
  if (target && storage.getItem(keys.theme) === null) {
    storage.setItem(keys.theme, target[0]);
    storage.setItem(keys.appearance, target[1]);
  }
  storage.removeItem(keys.legacy);
}

export function createLegacyThemeMigrationScript(): string {
  const keys: LegacyThemeKeys = {
    legacy: LEGACY_THEME_STORAGE_KEY,
    theme: THEME_STORAGE_KEY,
    appearance: APPEARANCE_STORAGE_KEY,
    map: LEGACY_THEME_MAP,
  };
  const serialized = JSON.stringify(keys).replace(/</g, "\\u003c");
  return `try{(${migrateLegacyThemePreference.toString()})(localStorage,${serialized})}catch(e){};`;
}
