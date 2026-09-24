/**
 * 番茄钟运行态 store —— 计时在主进程，这里只镜像「当前会话 + 背景音」并推导结束结果。
 *
 * 通知 handler 在模块级随 WebSocket client 常驻注册（client 替换时迁移），不随页面卸载或
 * Activity 停驻丢失；主页面、侧栏徽标、小窗、沉浸窗各自的渲染进程各有一份。
 * 显示用的秒级时间由组件以本机时钟推导（sessionTiming），store 只在会话状态变化时更新，
 * 避免每秒 tick 让全部订阅者重渲染。
 */

import { create } from "zustand";
import { useEffect, useState } from "react";
import {
  getActivePomodoroSession,
  getBackgroundSound,
  pausePomodoroSession,
  resumePomodoroSession,
  setBackgroundSound,
  startPomodoroSession,
  stopPomodoroSession,
} from "@/commands/pomodoro";
import { useBackendWebsocketStore } from "@/stores/useBackendWebsocketStore";
import type { BackgroundSoundType } from "@/stores/usePomodoroStore";
import type { PomodoroPreset, PomodoroSession } from "@/types";
import { endedSession, sessionTiming, type EndedSession } from "./model";

export interface PomodoroEndResult extends EndedSession {
  /** 每次结束自增，订阅方据此判断「新结果」 */
  seq: number;
  endedAt: number;
}

interface PomodoroTimerState {
  session: PomodoroSession | null;
  sound: BackgroundSoundType;
  volume: number;
  /** 已与主进程同步过一次（未同步前不渲染「空闲」以免闪烁） */
  ready: boolean;
  lastResult: PomodoroEndResult | null;
}

export const usePomodoroTimer = create<PomodoroTimerState>()(() => ({
  session: null,
  sound: null,
  volume: 50,
  ready: false,
  lastResult: null,
}));

const sameSession = (a: PomodoroSession | null, b: PomodoroSession | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.startTime === b.startTime &&
    a.status === b.status &&
    a.pauseCount === b.pauseCount &&
    a.pauseTotalMs === b.pauseTotalMs);

function applySession(next: PomodoroSession | null) {
  const { session: prev, lastResult } = usePomodoroTimer.getState();
  if (sameSession(prev, next)) return;
  if (prev && !next) {
    const endedAt = Date.now();
    usePomodoroTimer.setState({
      session: null,
      lastResult: { ...endedSession(prev, endedAt), seq: (lastResult?.seq ?? 0) + 1, endedAt },
    });
    return;
  }
  usePomodoroTimer.setState({ session: next });
}

const onActiveChanged = (payload: unknown) => applySession((payload as PomodoroSession) ?? null);
const onTick = (payload: unknown) =>
  applySession((payload as { session: PomodoroSession }).session);
const onSoundChanged = (payload: unknown) => {
  const { backgroundSound, backgroundVolume } = payload as {
    backgroundSound: BackgroundSoundType;
    backgroundVolume: number;
  };
  usePomodoroTimer.setState({ sound: backgroundSound, volume: backgroundVolume });
};

/** 主动对齐主进程（首次就绪、窗口重新可见时） */
export async function syncPomodoroTimer() {
  const [session, sound] = await Promise.all([getActivePomodoroSession(), getBackgroundSound()]);
  usePomodoroTimer.setState({
    session,
    sound: sound.backgroundSound,
    volume: sound.backgroundVolume,
    ready: true,
  });
}

type Client = ReturnType<typeof useBackendWebsocketStore.getState>["client"];
let boundClient: Client = null;
function bindClient(client: Client) {
  if (client === boundClient) return;
  boundClient?.unregisterNotificationHandler("pomodoro:active-session-changed", onActiveChanged);
  boundClient?.unregisterNotificationHandler("pomodoro:tick", onTick);
  boundClient?.unregisterNotificationHandler("pomodoro:background-sound-changed", onSoundChanged);
  client?.registerNotificationHandler("pomodoro:active-session-changed", onActiveChanged);
  client?.registerNotificationHandler("pomodoro:tick", onTick);
  client?.registerNotificationHandler("pomodoro:background-sound-changed", onSoundChanged);
  boundClient = client;
}

const syncQuietly = () =>
  syncPomodoroTimer().catch(error => console.error("番茄钟状态同步失败:", error));

bindClient(useBackendWebsocketStore.getState().client);
if (useBackendWebsocketStore.getState().isServerReady) void syncQuietly();
useBackendWebsocketStore.subscribe((state, prev) => {
  bindClient(state.client);
  if (state.isServerReady && !prev.isServerReady) void syncQuietly();
});

/* ---------- 命令 ---------- */

export const pomodoroActions = {
  start(preset: PomodoroPreset) {
    const expected = preset.mode === "countdown" ? preset.durationMin * 60_000 : undefined;
    return startPomodoroSession(preset.id, expected);
  },
  pause: () => pausePomodoroSession(),
  resume: () => resumePomodoroSession(),
  toggle() {
    const { session } = usePomodoroTimer.getState();
    if (!session) return Promise.resolve(null);
    return session.status === "paused" ? resumePomodoroSession() : pausePomodoroSession();
  },
  /** 用户手动结束：倒计时未到点记为 stopped（到点 / 正计时记为 completed） */
  stop() {
    const { session } = usePomodoroTimer.getState();
    if (!session) return Promise.resolve(null);
    const { remainMs } = sessionTiming(session, Date.now());
    return stopPomodoroSession(!(remainMs !== undefined && remainMs > 0));
  },
  setSound(sound: BackgroundSoundType) {
    usePomodoroTimer.setState({ sound });
    return setBackgroundSound({ backgroundSound: sound });
  },
  setVolume(volume: number) {
    usePomodoroTimer.setState({ volume });
    return setBackgroundSound({ backgroundVolume: volume });
  },
};

/**
 * 秒级「现在」：有会话时每秒刷新一次（按整秒边界去重），无会话时停表。
 * 计时显示由此推导，不依赖主进程 tick 的到达节奏。
 */
export function useSecondNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    let lastSecond = Math.floor(Date.now() / 1000);
    const timer = window.setInterval(() => {
      const t = Date.now();
      const second = Math.floor(t / 1000);
      if (second !== lastSecond) {
        lastSecond = second;
        setNow(t);
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/** 当前会话 + 秒级计时（无会话时 timing 为 null） */
export function useLiveTiming() {
  const session = usePomodoroTimer(s => s.session);
  const now = useSecondNow(session != null);
  return { session, timing: session ? sessionTiming(session, now) : null, now };
}
