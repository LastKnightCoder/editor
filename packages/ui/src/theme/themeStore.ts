import { create } from "zustand";
import { applyThemeToDom } from "./theme";
import { resolveThemePreference, themeRuntimeConfig } from "./bootstrap";

export type ThemeMode = string;
export interface ThemeState {
  mode: ThemeMode;
  resolved: string;
  setMode(mode: ThemeMode): void;
}
export interface ThemeRuntimeOptions {
  storage?: () => Pick<Storage, "getItem" | "setItem"> | null;
  storageKey?: string;
  light?: string;
  dark?: string;
  root?: () => HTMLElement | null;
  media?: () => MediaQueryList | null;
}

export function createThemeRuntime(options: ThemeRuntimeOptions = {}) {
  const config = () =>
    themeRuntimeConfig({
      ...(options.light ? { light: options.light } : {}),
      ...(options.dark ? { dark: options.dark } : {}),
      ...(options.storageKey ? { storageKey: options.storageKey } : {}),
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
  const resolve = (mode: ThemeMode) =>
    resolveThemePreference(mode, media()?.matches ?? false, config());
  const apply = (key: string) => {
    const element = root();
    if (element) applyThemeToDom(key, element);
  };
  const store = create<ThemeState>(set => ({
    mode: config().light,
    resolved: config().light,
    setMode: mode => {
      if (mode !== "system" && !Object.prototype.hasOwnProperty.call(config().themes, mode))
        throw new Error("未注册的主题：" + mode);
      const resolved = resolve(mode);
      try {
        storage()?.setItem(config().storageKey, mode);
      } catch {
        /* 存储受限时保留当前会话偏好。 */
      }
      set({ mode, resolved });
      if (users) apply(resolved);
    },
  }));
  const init = () => {
    if (users++ === 0) {
      let saved: string | null = null;
      try {
        saved = storage()?.getItem(config().storageKey) ?? null;
      } catch {
        /* 使用默认主题。 */
      }
      const mode =
        saved === "system" ||
        (saved && Object.prototype.hasOwnProperty.call(config().themes, saved))
          ? saved
          : config().light;
      store.setState({ mode, resolved: resolve(mode) });
      const query = media();
      if (query) {
        const changed = () => {
          if (store.getState().mode === "system") {
            const resolved = resolve("system");
            store.setState({ resolved });
            apply(resolved);
          }
        };
        query.addEventListener("change", changed);
        stop = () => query.removeEventListener("change", changed);
      }
    }
    apply(store.getState().resolved);
    let disposed = false;
    return () => {
      if (!disposed) {
        disposed = true;
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
export function nextMode(
  current: ThemeMode,
  order: readonly string[] = ["cream", "cocoa", "system"]
): ThemeMode {
  return order[(order.indexOf(current) + 1) % order.length] ?? "cream";
}
