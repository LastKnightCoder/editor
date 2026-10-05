/**
 * 侧栏主题同步：主题族跟随桌面（可关掉），明暗只由扩展自己的偏好决定。
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyDesktopTheme,
  initExtensionTheme,
  useExtensionThemeStore,
  useThemeFollowStore,
} from "../useExtensionTheme";

describe("扩展主题跟随桌面", () => {
  beforeEach(() => {
    localStorage.clear();
    useThemeFollowStore.getState().setFollow(true);
    useExtensionThemeStore.getState().setTheme("paper");
    useExtensionThemeStore.getState().setAppearance("light");
  });

  it("跟随时应用桌面主题，且写到 <html data-theme>，明暗不受影响", () => {
    const stop = initExtensionTheme();
    useExtensionThemeStore.getState().setAppearance("dark");
    applyDesktopTheme("sakura");
    expect(useExtensionThemeStore.getState().theme).toBe("sakura");
    expect(document.documentElement.dataset.theme).toBe("sakura");
    expect(document.documentElement.dataset.mode).toBe("dark");
    stop();
  });

  it("关掉跟随后忽略桌面推送，保留自选主题", () => {
    useThemeFollowStore.getState().setFollow(false);
    useExtensionThemeStore.getState().setTheme("mint");
    applyDesktopTheme("ink");
    expect(useExtensionThemeStore.getState().theme).toBe("mint");
    expect(localStorage.getItem("tau-ext-theme-follow")).toBe("0");
  });

  it("扩展未注册的主题与非法载荷保持当前", () => {
    applyDesktopTheme("future-theme");
    applyDesktopTheme(undefined);
    expect(useExtensionThemeStore.getState().theme).toBe("paper");
  });

  it("首次启动时明暗默认跟随系统", () => {
    localStorage.clear();
    const stop = initExtensionTheme();
    expect(localStorage.getItem("tau-ext-appearance")).toBe("system");
    stop();
  });
});
