import { useCallback, useEffect, useState } from "react";
import { platform } from "@/platform";

export const canToggleFullScreen = () => platform.supports("window.toggle-fullscreen");

/** 按目标状态切换窗口全屏（平台只提供 toggle，先查当前状态） */
async function ensureFullScreen(want: boolean) {
  if (!canToggleFullScreen()) return;
  const { isFullScreen } = await platform.window.getState();
  if (isFullScreen !== want) await platform.window.toggleFullScreen();
}

/**
 * 挂载期间窗口全屏（演示 / 沉浸写作）：进入时若未全屏则打开，卸载时还原到进入前的状态。
 * 返回当前全屏状态与手动切换；平台不支持时恒为非全屏、切换无操作。
 */
export function useFullScreenWhileMounted() {
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    if (!canToggleFullScreen()) return;
    let disposed = false;
    let wasFullScreen = true;
    const unsubscribe = platform.supports("window.fullscreen-events")
      ? platform.window.onFullScreenChange(setFullScreen)
      : undefined;
    void platform.window.getState().then(state => {
      if (disposed) return;
      wasFullScreen = state.isFullScreen;
      setFullScreen(state.isFullScreen);
      if (!state.isFullScreen) void platform.window.toggleFullScreen();
    });
    return () => {
      disposed = true;
      unsubscribe?.();
      if (!wasFullScreen) void ensureFullScreen(false);
    };
  }, []);

  const toggle = useCallback(() => {
    if (canToggleFullScreen()) void platform.window.toggleFullScreen();
  }, []);

  return { fullScreen, toggle };
}
