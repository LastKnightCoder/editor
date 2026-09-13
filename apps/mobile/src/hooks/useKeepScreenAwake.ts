// Screen Wake Lock：active 期间请求屏幕常亮。
// Tauri 的 WebView（Android Chromium WebView 84+ / iOS WKWebView 16.4+）支持该 API，
// 不支持的旧系统静默降级为正常息屏。
import { useEffect } from "react";

// TS 内置 lib.dom 未收录 Wake Lock 类型，声明用到的最小子集
type WakeLockSentinel = { release: () => Promise<void> };
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
};

/** active 为 true 期间保持屏幕常亮，卸载或置 false 时释放 */
export function useKeepScreenAwake(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const lock = await nav.wakeLock!.request("screen");
        if (cancelled) void lock.release();
        else sentinel = lock;
      } catch {
        // 低电量等场景系统会拒绝，降级为正常息屏
      }
    };

    // WebView 整体不可见（切后台）时系统会自动释放锁，回到前台需重新获取
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void sentinel?.release();
      sentinel = null;
    };
  }, [active]);
}
