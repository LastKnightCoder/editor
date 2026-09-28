import { create } from "zustand";
import { applyThemeToDom } from "./dom";
import type { ThemeMode } from "./defineTheme";
import { resolveThemePreference, themeRuntimeConfig, type Appearance } from "./bootstrap";

export type { Appearance } from "./bootstrap";
export type { ThemeMode } from "./defineTheme";

export interface ThemeState {
  /** 主题族 key */
  theme: string;
  /** 明暗偏好（light / dark / system） */
  appearance: Appearance;
  /** 生效明暗：appearance 解析 system 后的结果（沉浸窗等强制明暗时为强制值） */
  mode: ThemeMode;
  setTheme(theme: string): void;
  setAppearance(appearance: Appearance): void;
}
export interface ThemeRuntimeOptions {
  storage?: () => Pick<Storage, "getItem" | "setItem"> | null;
  themeStorageKey?: string;
  appearanceStorageKey?: string;
  defaultTheme?: string;
  root?: () => HTMLElement | null;
  media?: () => MediaQueryList | null;
}
export interface ThemeRuntimeInitOptions {
  /** 固定明暗（不跟随偏好与系统），主题族仍跟随用户 */
  forceMode?: ThemeMode;
}

function isAppearance(value: string): value is Appearance {
  return value === "light" || value === "dark" || value === "system";
}

export function createThemeRuntime(options: ThemeRuntimeOptions = {}) {
  const config = () =>
    themeRuntimeConfig({
      ...(options.defaultTheme ? { defaultTheme: options.defaultTheme } : {}),
      ...(options.themeStorageKey ? { themeStorageKey: options.themeStorageKey } : {}),
      ...(options.appearanceStorageKey
        ? { appearanceStorageKey: options.appearanceStorageKey }
        : {}),
    });
  const storage = () => {
    try {
      return options.storage
        ? options.storage()
        : typeof localStorage === "undefined"
          ? null
          : localStorage;
    } catch {
      return null;
    }
  };
  const root = () =>
    options.root
      ? options.root()
      : typeof document === "undefined"
        ? null
        : document.documentElement;
  const media = () =>
    options.media
      ? options.media()
      : typeof matchMedia === "undefined"
        ? null
        : matchMedia("(prefers-color-scheme: dark)");
  let users = 0;
  let stop: (() => void) | undefined;
  let forcedMode: ThemeMode | undefined;
  const resolveMode = (appearance: Appearance): ThemeMode =>
    forcedMode ?? (appearance === "system" ? (media()?.matches ? "dark" : "light") : appearance);
  const persist = (key: string, value: string) => {
    try {
      storage()?.setItem(key, value);
    } catch {
      /* 存储受限时保留当前会话偏好。 */
    }
  };
  const apply = () => {
    const element = root();
    const { theme, mode } = store.getState();
    if (element && users) applyThemeToDom(theme, mode, element);
  };
  const initial = resolveThemePreference(null, null, false, config());
  const store = create<ThemeState>(set => ({
    theme: initial.theme,
    appearance: initial.appearance,
    mode: initial.mode,
    setTheme: theme => {
      if (!config().themes.includes(theme)) throw new Error("未注册的主题：" + theme);
      persist(config().themeStorageKey, theme);
      set({ theme });
      apply();
    },
    setAppearance: appearance => {
      if (!isAppearance(appearance)) throw new Error("未知的明暗偏好：" + String(appearance));
      persist(config().appearanceStorageKey, appearance);
      set({ appearance, mode: resolveMode(appearance) });
      apply();
    },
  }));
  const init = ({ forceMode }: ThemeRuntimeInitOptions = {}) => {
    if (forceMode) forcedMode = forceMode;
    if (users++ === 0) {
      const { themeStorageKey, appearanceStorageKey } = config();
      let savedTheme: string | null = null;
      let savedAppearance: string | null = null;
      try {
        savedTheme = storage()?.getItem(themeStorageKey) ?? null;
        savedAppearance = storage()?.getItem(appearanceStorageKey) ?? null;
      } catch {
        /* 使用默认主题。 */
      }
      const resolved = resolveThemePreference(
        savedTheme,
        savedAppearance,
        media()?.matches ?? false,
        config()
      );
      // 旧值迁移 / 非法值纠正后写回，保证其它窗口与下次首帧读到的是新格式
      if (savedTheme !== null && savedTheme !== resolved.theme)
        persist(themeStorageKey, resolved.theme);
      if (savedTheme !== null && savedAppearance !== resolved.appearance)
        persist(appearanceStorageKey, resolved.appearance);
      store.setState({
        theme: resolved.theme,
        appearance: resolved.appearance,
        mode: resolveMode(resolved.appearance),
      });
      const query = media();
      if (query) {
        const changed = () => {
          const { appearance } = store.getState();
          if (appearance === "system" && !forcedMode) {
            store.setState({ mode: resolveMode(appearance) });
            apply();
          }
        };
        query.addEventListener("change", changed);
        stop = () => query.removeEventListener("change", changed);
      }
    } else if (forceMode) {
      store.setState({ mode: forceMode });
    }
    apply();
    let disposed = false;
    return () => {
      if (!disposed) {
        disposed = true;
        if (forceMode && forcedMode === forceMode) forcedMode = undefined;
        if (--users === 0) {
          stop?.();
          stop = undefined;
        }
      }
    };
  };
  return { useThemeStore: store, init };
}

const defaultRuntime = createThemeRuntime();
export const useThemeStore = defaultRuntime.useThemeStore;
export const initThemeRuntime = defaultRuntime.init;

const APPEARANCE_ORDER: readonly Appearance[] = ["light", "dark", "system"];

/** 快捷切换的明暗循环：浅色 → 深色 → 跟随系统 */
export function nextAppearance(current: Appearance): Appearance {
  return APPEARANCE_ORDER[(APPEARANCE_ORDER.indexOf(current) + 1) % APPEARANCE_ORDER.length];
}
