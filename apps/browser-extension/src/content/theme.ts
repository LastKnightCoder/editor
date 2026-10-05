import { getTheme } from "@tau/themes";

/** 侧栏把生效的主题族与明暗偏好镜像到这里（扩展页的 localStorage 在网页里读不到） */
export const CONTENT_THEME_STORAGE_KEY = "tau-ext-content-theme";

export interface ContentThemeState {
  theme: string;
  /** light / dark / system；system 按页面所在系统的明暗解析 */
  appearance: string;
}

const DEFAULT_STATE: ContentThemeState = { theme: "paper", appearance: "system" };

export function resolveContentTheme(
  state: Partial<ContentThemeState> | undefined,
  prefersDark: boolean
): { theme: string; mode: "light" | "dark" } {
  const theme = state?.theme && getTheme(state.theme) ? state.theme : DEFAULT_STATE.theme;
  const appearance = state?.appearance ?? DEFAULT_STATE.appearance;
  const mode =
    appearance === "dark" || appearance === "light" ? appearance : prefersDark ? "dark" : "light";
  return { theme, mode };
}

/**
 * 让页面内划线 UI 的根容器跟随侧栏主题：读一次偏好，之后跟随偏好变化与系统明暗变化。
 * 返回取消函数。
 */
export function bindContentTheme(root: HTMLElement): () => void {
  let state: Partial<ContentThemeState> | undefined;
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  const apply = () => {
    const { theme, mode } = resolveContentTheme(state, media?.matches ?? false);
    root.dataset.theme = theme;
    root.dataset.mode = mode;
    root.style.colorScheme = mode;
  };
  apply();

  chrome.storage.local
    .get(CONTENT_THEME_STORAGE_KEY)
    .then(result => {
      state = result[CONTENT_THEME_STORAGE_KEY] as ContentThemeState | undefined;
      apply();
    })
    .catch(() => undefined);

  const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== "local" || !changes[CONTENT_THEME_STORAGE_KEY]) return;
    state = changes[CONTENT_THEME_STORAGE_KEY].newValue as ContentThemeState | undefined;
    apply();
  };
  chrome.storage.onChanged.addListener(onStorage);
  media?.addEventListener("change", apply);
  return () => {
    chrome.storage.onChanged.removeListener(onStorage);
    media?.removeEventListener("change", apply);
  };
}
