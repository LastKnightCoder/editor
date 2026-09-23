/**
 * 窗口全屏状态（platform 订阅 + 初值回查）。
 * mac 信号灯在全屏下隐藏（对齐原生惯例），壳层布局随之收拢；
 * Web 无窗口概念（订阅能力同步抛 UnsupportedError），恒按非全屏处理。
 */
import { useEffect, useState } from "react";
import { platform } from "@/platform";

export function useFullScreen() {
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    if (!platform.supports("window.fullscreen-events")) return;
    // 初值回查：挂载时已处于全屏不会再来事件（页面刷新/组件重挂）
    void platform.window.getState().then(
      state => setFullScreen(state.isFullScreen),
      () => setFullScreen(false)
    );
    return platform.window.onFullScreenChange(setFullScreen);
  }, []);

  return fullScreen;
}
