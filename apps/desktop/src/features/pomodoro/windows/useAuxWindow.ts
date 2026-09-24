/**
 * 番茄辅助窗口（小窗 / 沉浸）的公共启动：主题运行时、数据库连接（预设名需要查库）、
 * 窗口重新可见时与主进程对齐会话，以及「本窗口可见期间」的结束结果。
 */

import { useEffect, useRef, useState } from "react";
import { THEME_STORAGE_KEY } from "@tau/ui/theme";
import { initThemeRuntime, useThemeStore } from "@tau/ui/theme/runtime";
import { ensureDatabaseReady } from "@/app/databaseReady";
import useSettingStore from "@/stores/useSettingStore";
import { syncPomodoroTimer, usePomodoroTimer, type PomodoroEndResult } from "../timerStore";

/** forceTheme：沉浸窗固定深色（整页纯黑，弹出层也须是深色 token），不跟随用户主题 */
export function useAuxWindowBoot({ forceTheme }: { forceTheme?: "cocoa" } = {}): {
  dbReady: boolean;
} {
  const [dbReady, setDbReady] = useState(false);
  const settingInited = useSettingStore(s => s.inited);
  const database = useSettingStore(s => s.setting.database.active);

  // 设置经 websocket 同步完成（App 根的 useSyncSetting）后才知道要连哪个库
  useEffect(() => {
    if (!settingInited || !database) return;
    let alive = true;
    void ensureDatabaseReady().then(ok => alive && setDbReady(ok));
    return () => {
      alive = false;
    };
  }, [settingInited, database]);

  useEffect(() => {
    let stopTheme: (() => void) | null = null;
    if (forceTheme) {
      const root = document.documentElement;
      root.dataset.theme = forceTheme;
      root.style.colorScheme = "dark";
      root.classList.add("dark");
    } else {
      stopTheme = initThemeRuntime();
    }
    // 窗口常驻隐藏复用，主题只在启动时读过一次：主窗口改主题（写 localStorage）时经 storage 事件跟上
    const onStorage = (e: StorageEvent) => {
      if (forceTheme || e.key !== THEME_STORAGE_KEY || !e.newValue) return;
      try {
        useThemeStore.getState().setMode(e.newValue);
      } catch {
        /* 未注册的主题：保持当前 */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncPomodoroTimer().catch(() => undefined);
    };
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopTheme?.();
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [forceTheme]);
  return { dbReady };
}

/**
 * 结束结果：只认本窗口挂载后产生的结果；新会话开始即清除。
 * 返回 [result, dismiss]。
 */
export function useEndResult(): [PomodoroEndResult | null, () => void] {
  const lastResult = usePomodoroTimer(s => s.lastResult);
  const session = usePomodoroTimer(s => s.session);
  const baseline = useRef(lastResult?.seq ?? 0);
  const [dismissedSeq, setDismissedSeq] = useState(0);
  const fresh =
    !session && lastResult && lastResult.seq > baseline.current && lastResult.seq > dismissedSeq
      ? lastResult
      : null;
  return [fresh, () => setDismissedSeq(lastResult?.seq ?? 0)];
}

/**
 * 抵消页面缩放：Chromium 的缩放按 origin 共享，主窗口 Cmd± 会连带放大这里的固定尺寸窗口，
 * 内容撑不下。返回 1 / zoomFactor 供内容层的 CSS zoom 用；zoom 变化必伴生 resize，以它为信号。
 */
export function useCancelPageZoom(): number {
  const read = () => 1 / (window.electron?.getZoomFactor?.() ?? 1);
  const [inverse, setInverse] = useState(read);
  useEffect(() => {
    const update = () => setInverse(read());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return inverse;
}
