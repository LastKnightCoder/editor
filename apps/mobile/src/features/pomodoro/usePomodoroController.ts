// 活动会话控制器：订阅后端活动会话（query），本地 1s tick 推算 elapsed/remain，
// 提供 start/pause/resume/stop 编排（成功后 invalidate 整个 pomodoro 域）。
// 倒计时归零时自动以「完成」收尾（对齐桌面端 autoStop 语义）。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PomodoroPreset, PomodoroSession } from "../../types";
import * as tauri from "../../services/tauri";
import { computeElapsedMs, computeRemainMs } from "./timer";
import { invalidatePomodoroQueries } from "./queries";

const MIN_FOCUS_MS = 5 * 60 * 1000;

export type PomodoroTick = {
  session: PomodoroSession;
  elapsedMs: number;
  remainMs: number | null;
};

export type UsePomodoroControllerResult = {
  session: PomodoroSession | null;
  /** 活动会话查询是否仍在路上：此时 session 为 null 不能断定"无会话" */
  isActiveLoading: boolean;
  preset: PomodoroPreset | null;
  tick: PomodoroTick | null;
  isRunning: boolean;
  isPaused: boolean;
  /** 倒计时归零自动完成后的标记（UI 展示庆祝态，用户离开页面/点击后清除） */
  justCompleted: boolean;
  /** 自动完成落库的会话快照（庆祝态展示用，不依赖预设仍存在） */
  lastCompleted: PomodoroSession | null;
  clearJustCompleted: () => void;
  /** 成功建立会话返回 true；失败返回 false（错误已上报 onError） */
  start: (preset: PomodoroPreset) => Promise<boolean>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  /** 结束；不足 5 分钟时由 UI 先行确认，此处直接调用（后端对 <5min 不落库） */
  stop: (asComplete?: boolean) => Promise<PomodoroSession | null>;
  busy: boolean;
};

export function usePomodoroController(
  presets: PomodoroPreset[],
  onError: (error: unknown, fallback: string) => void
): UsePomodoroControllerResult {
  const activeQuery = useQuery({
    queryKey: ["pomodoro", "active"],
    queryFn: () => tauri.pomodoroGetActiveSession(),
    staleTime: 0,
    // 每次挂载/窗口聚焦都重拉：沉浸页与主页共用同一后端会话
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });

  const session = activeQuery.data ?? null;
  const isActiveLoading = activeQuery.isPending;
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [lastCompleted, setLastCompleted] = useState<PomodoroSession | null>(null);
  const autoStopRef = useRef(false);

  // tick：仅存在活动会话时驱动；暂停状态保持 tick（暂停时长仍在累计，表盘冻结在 elapsed）
  const sessionId = session?.id ?? null;
  useEffect(() => {
    if (sessionId == null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sessionId]);

  useEffect(() => {
    if (!session) {
      autoStopRef.current = false;
    }
  }, [session]);

  const elapsedMs = session ? computeElapsedMs(session, now) : 0;
  const remainMs = session ? computeRemainMs(session, now) : null;

  const stop = useCallback(
    async (asComplete = true) => {
      setBusy(true);
      try {
        const saved = await tauri.pomodoroStopSession(asComplete);
        await activeQuery.refetch();
        invalidatePomodoroQueries();
        return saved;
      } catch (error) {
        onError(error, "结束专注失败");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [activeQuery, onError]
  );

  // 倒计时归零自动完成（running 态、每会话只触发一次）
  useEffect(() => {
    if (!session || session.status !== "running" || remainMs == null || remainMs > 0) return;
    if (autoStopRef.current) return;
    autoStopRef.current = true;
    void (async () => {
      const saved = await stop(true);
      if (saved) {
        setJustCompleted(true);
        setLastCompleted(saved);
        if ("vibrate" in navigator) navigator.vibrate?.(200);
      }
    })();
  }, [session, remainMs, stop]);

  const start = useCallback(
    async (preset: PomodoroPreset): Promise<boolean> => {
      setBusy(true);
      try {
        const expectedMs = preset.mode === "countdown" ? preset.durationMin * 60 * 1000 : undefined;
        await tauri.pomodoroStartSession(preset.id, expectedMs);
        await activeQuery.refetch();
        return true;
      } catch (error) {
        onError(error, "开始专注失败");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [activeQuery, onError]
  );

  const pause = useCallback(async () => {
    setBusy(true);
    try {
      await tauri.pomodoroPauseSession();
      await activeQuery.refetch();
    } catch (error) {
      onError(error, "暂停专注失败");
    } finally {
      setBusy(false);
    }
  }, [activeQuery, onError]);

  const resume = useCallback(async () => {
    setBusy(true);
    try {
      await tauri.pomodoroResumeSession();
      await activeQuery.refetch();
    } catch (error) {
      onError(error, "继续专注失败");
    } finally {
      setBusy(false);
    }
  }, [activeQuery, onError]);

  const preset = useMemo(
    () => (session ? (presets.find(item => item.id === session.presetId) ?? null) : null),
    [session, presets]
  );

  return {
    session,
    isActiveLoading,
    preset,
    tick: session ? { session, elapsedMs, remainMs } : null,
    isRunning: session?.status === "running",
    isPaused: session?.status === "paused",
    justCompleted,
    lastCompleted,
    clearJustCompleted: () => {
      setJustCompleted(false);
      setLastCompleted(null);
    },
    start,
    pause,
    resume,
    stop,
    busy,
  };
}

/** 结束前判断：不足 5 分钟需要 UI 二次确认（对齐桌面端规则） */
export function needsStopConfirm(tick: PomodoroTick | null): boolean {
  return tick != null && computeElapsedMs(tick.session, Date.now()) < MIN_FOCUS_MS;
}
