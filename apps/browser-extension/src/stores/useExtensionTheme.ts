import { useEffect } from "react";
import { create } from "zustand";
import { APPEARANCE_METHODS, type AppearanceThemePayload } from "@tau/shared";
import { getTheme } from "@tau/themes";
import { createThemeRuntime } from "@tau/themes/react";
import type WebSocketClient from "../utils/WebSocketClient";

/**
 * 侧栏主题：主题族默认跟随桌面（经 aiServer 同步），可在设置里关掉跟随自选；
 * 明暗只由扩展自己的偏好决定，默认跟随系统。
 * 偏好存 localStorage（扩展页同源、同步可读），首帧在 main.tsx 渲染前就位，不闪。
 */
const THEME_KEY = "tau-ext-theme";
const APPEARANCE_KEY = "tau-ext-appearance";
const FOLLOW_KEY = "tau-ext-theme-follow";

const runtime = createThemeRuntime({
  themeStorageKey: THEME_KEY,
  appearanceStorageKey: APPEARANCE_KEY,
});

export const useExtensionThemeStore = runtime.useThemeStore;

const readFollow = () => {
  try {
    return localStorage.getItem(FOLLOW_KEY) !== "0";
  } catch {
    return true;
  }
};

interface ThemeFollowState {
  /** 主题族跟随桌面 */
  follow: boolean;
  setFollow: (follow: boolean) => void;
}

export const useThemeFollowStore = create<ThemeFollowState>(set => ({
  follow: readFollow(),
  setFollow: follow => {
    try {
      localStorage.setItem(FOLLOW_KEY, follow ? "1" : "0");
    } catch {
      /* 存储受限时只在本次会话生效 */
    }
    set({ follow });
  },
}));

/** 启动主题运行时；首次使用时明暗默认跟随系统（运行时的通用默认是浅色） */
export function initExtensionTheme() {
  try {
    if (localStorage.getItem(APPEARANCE_KEY) === null)
      localStorage.setItem(APPEARANCE_KEY, "system");
  } catch {
    /* 用运行时默认 */
  }
  return runtime.init();
}

/** 收到桌面主题族：跟随时应用；扩展没有的主题（桌面更新更早）保持当前 */
export function applyDesktopTheme(theme: unknown) {
  if (!useThemeFollowStore.getState().follow) return;
  if (typeof theme !== "string" || !getTheme(theme)) return;
  if (useExtensionThemeStore.getState().theme !== theme) {
    useExtensionThemeStore.getState().setTheme(theme);
  }
}

/** 连上桌面后读取一次主题族，之后跟随推送；重新打开「跟随」时也读一次 */
export function useDesktopThemeSync(client: WebSocketClient | null, connected: boolean) {
  const follow = useThemeFollowStore(state => state.follow);

  useEffect(() => {
    if (!client || !connected) return;
    const onChanged = (data: unknown) => applyDesktopTheme((data as AppearanceThemePayload)?.theme);
    client.registerNotificationHandler(APPEARANCE_METHODS.themeChanged, onChanged);
    return () => client.unregisterNotificationHandler(APPEARANCE_METHODS.themeChanged, onChanged);
  }, [client, connected]);

  useEffect(() => {
    if (!client || !connected || !follow) return;
    client
      .sendRequest(APPEARANCE_METHODS.getTheme, {})
      .then(result => applyDesktopTheme((result as AppearanceThemePayload | null)?.theme))
      .catch(error => console.warn("[theme] 读取桌面主题失败", error));
  }, [client, connected, follow]);
}

/** 当前是否深色（编辑器、图表等仍按 isDark 传参的组件用） */
export const useIsDark = () => useExtensionThemeStore(state => state.mode === "dark");
