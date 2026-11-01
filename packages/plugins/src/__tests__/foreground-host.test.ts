// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  APP_FOREGROUND_EVENT,
  APP_BACKGROUND_EVENT,
  createAppForegroundBridge,
} from "../foreground-host";

let bridge: ReturnType<typeof createAppForegroundBridge> | undefined;
afterEach(() => {
  bridge?.dispose();
  bridge = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("恢复信号防抖且只发一次，初始聚焦与持续前台不产生轮询事件", () => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const foreground = vi.fn();
  const background = vi.fn();
  window.addEventListener(APP_FOREGROUND_EVENT, foreground);
  window.addEventListener(APP_BACKGROUND_EVENT, background);
  bridge = createAppForegroundBridge(window);
  try {
    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(30_000);
    expect(foreground).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    bridge.resume();
    vi.advanceTimersByTime(499);
    expect(foreground).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(foreground).toHaveBeenCalledTimes(1);
    expect(background).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(60_000);
    expect(foreground).toHaveBeenCalledTimes(1);
  } finally {
    window.removeEventListener(APP_FOREGROUND_EVENT, foreground);
    window.removeEventListener(APP_BACKGROUND_EVENT, background);
  }
});

it("WebView 不更新可见性时仍接受原生恢复，后台和清理会取消待发事件", () => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  const foreground = vi.fn();
  window.addEventListener(APP_FOREGROUND_EVENT, foreground);
  bridge = createAppForegroundBridge(window);
  try {
    bridge.resume();
    vi.advanceTimersByTime(500);
    expect(foreground).toHaveBeenCalledTimes(1);
    bridge.resume();
    bridge.background();
    vi.advanceTimersByTime(500);
    expect(foreground).toHaveBeenCalledTimes(1);
    bridge.resume();
    bridge.dispose();
    vi.advanceTimersByTime(500);
    window.dispatchEvent(new Event("focus"));
    expect(foreground).toHaveBeenCalledTimes(1);
  } finally {
    window.removeEventListener(APP_FOREGROUND_EVENT, foreground);
  }
});
