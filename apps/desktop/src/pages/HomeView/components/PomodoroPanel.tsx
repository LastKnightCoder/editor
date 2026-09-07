import React, { useEffect, useMemo, useState } from "react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";
import { Timer, Play, Pause, Square, ArrowRight, Clock3 } from "lucide-react";
import type { PomodoroPreset, PomodoroSession } from "@/types/pomodoro";
import { TabType } from "@/types/tab";
import useTabStore from "@/stores/useTabStore";

const MINUTE_MS = 60_000;
const SECOND_MS = 1_000;
const TODAY_SESSION_PREVIEW_LIMIT = 3;

const fmt = (ms: number) => {
  const s = Math.floor(ms / SECOND_MS);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  const mm = Math.floor(m % 60);
  const hh = Math.floor(m / 60);
  return (
    (hh > 0 ? `${hh}:` : "") + `${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`
  );
};

const getPomodoroSessionTiming = (session: PomodoroSession, now: number) => {
  let pauseTotalMs = session.pauseTotalMs;

  if (session.status === "paused") {
    const lastPause = session.pauses[session.pauses.length - 1];
    if (lastPause && lastPause.end === undefined) {
      pauseTotalMs += now - lastPause.start;
    }
  }

  const elapsedMs = Math.max(0, now - session.startTime - pauseTotalMs);
  const remainMs =
    session.expectedMs !== undefined ? Math.max(0, session.expectedMs - elapsedMs) : undefined;

  return { elapsedMs, remainMs };
};

// 进行中的计时条需要秒级刷新，使用固定 1s 间隔
const usePomodoroPanelNow = (activeSession: PomodoroSession | null) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());

    if (
      !activeSession ||
      (activeSession.status !== "running" && activeSession.status !== "paused")
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, SECOND_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    activeSession?.id,
    activeSession?.status,
    activeSession?.startTime,
    activeSession?.expectedMs,
    activeSession?.pauseTotalMs,
    activeSession?.pauseCount,
    activeSession?.updateTime,
  ]);

  return now;
};

interface PomodoroPanelProps {
  todayStats: { count: number; focusMs: number };
  activeSession: PomodoroSession | null;
  presets: PomodoroPreset[];
  recentSessions?: PomodoroSession[];
  todaySessions?: PomodoroSession[];
  onStartSession?: (presetId: number, expectedMs?: number) => void;
  onPauseSession?: () => void;
  onResumeSession?: () => void;
  onStopSession?: () => void;
}

const PomodoroPanel: React.FC<PomodoroPanelProps> = ({
  todayStats,
  activeSession,
  presets,
  recentSessions = [],
  todaySessions = [],
  onStartSession,
  onPauseSession,
  onResumeSession,
  onStopSession,
}) => {
  const themeColors = useThemeColors();
  const now = usePomodoroPanelNow(activeSession);
  const openInNewTab = useTabStore(state => state.openInNewTab);

  const formatMs = (ms: number): string => {
    const totalMinutes = Math.round(ms / MINUTE_MS);
    if (totalMinutes < 60) return `${totalMinutes}分钟`;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const activePresets = useMemo(() => presets.filter(preset => !preset.archived), [presets]);

  const availablePresets = useMemo(() => {
    const presetsById = new Map(activePresets.map(preset => [preset.id, preset]));
    const recentPresetIds = new Set<number>();
    const recentPresets: PomodoroPreset[] = [];

    recentSessions
      .slice()
      .sort((a, b) => b.startTime - a.startTime)
      .forEach(session => {
        if (recentPresetIds.has(session.presetId)) return;
        const preset = presetsById.get(session.presetId);
        if (!preset) return;

        recentPresetIds.add(session.presetId);
        recentPresets.push(preset);
      });

    return (recentPresets.length > 0 ? recentPresets : activePresets).slice(0, 3);
  }, [activePresets, recentSessions]);

  const activePreset = useMemo(
    () => presets.find(p => p.id === activeSession?.presetId),
    [presets, activeSession]
  );
  const presetsById = useMemo(() => new Map(presets.map(preset => [preset.id, preset])), [presets]);
  const todaySessionPreview = useMemo(
    () =>
      todaySessions
        .filter(session => session.status === "completed")
        .slice()
        .sort((a, b) => (b.endTime ?? b.updateTime) - (a.endTime ?? a.updateTime))
        .slice(0, TODAY_SESSION_PREVIEW_LIMIT),
    [todaySessions]
  );

  const isRunning = activeSession?.status === "running";
  const isPaused = activeSession?.status === "paused";
  const isActive = !!activeSession && (isRunning || isPaused);

  const { elapsedMs, remainMs } = activeSession
    ? getPomodoroSessionTiming(activeSession, now)
    : { elapsedMs: 0, remainMs: undefined as number | undefined };

  const progress = useMemo(() => {
    if (!activeSession || activeSession.expectedMs === undefined) return 0;
    if (activeSession.expectedMs <= 0) return 0;
    const elapsed = activeSession.expectedMs - Math.max(remainMs ?? 0, 0);
    return Math.min(Math.max((elapsed / activeSession.expectedMs) * 100, 0), 100);
  }, [activeSession, remainMs]);

  const handleViewAll = () => {
    openInNewTab(TabType.Pomodoro);
  };

  return (
    <div
      className={classNames(
        "flex min-h-[200px] flex-col rounded-xl border p-4",
        themeColors.cardBorderClass,
        themeColors.cardBgClass
      )}
    >
      {/* 标题行 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={classNames(
              "flex h-8 w-8 items-center justify-center rounded-lg",
              themeColors.iconBgClass
            )}
          >
            <Timer className={classNames("h-4 w-4", themeColors.iconTextClass)} />
          </div>
          <h3 className={classNames("text-sm font-semibold", themeColors.textClass)}>番茄钟</h3>
        </div>
        <button
          onClick={handleViewAll}
          className={classNames(
            "flex cursor-pointer items-center gap-1 text-xs transition-colors",
            themeColors.secondaryTextClass,
            "hover:opacity-80"
          )}
        >
          查看全部
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {/* 今日统计 */}
      <div className="mb-3 flex items-baseline gap-1.5">
        <span className={classNames("text-2xl font-bold tabular-nums", themeColors.textClass)}>
          {formatMs(todayStats.focusMs)}
        </span>
        <span className={classNames("text-xs", themeColors.secondaryTextClass)}>
          今日专注 · {todayStats.count} 次
        </span>
      </div>

      <div className="mb-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className={classNames("text-xs font-medium", themeColors.secondaryTextClass)}>
            今日记录
          </span>
          {todaySessions.length > todaySessionPreview.length && (
            <span className={classNames("text-[11px]", themeColors.secondaryTextClass)}>
              +{todaySessions.length - todaySessionPreview.length}
            </span>
          )}
        </div>
        {todaySessionPreview.length > 0 ? (
          <div className="space-y-1">
            {todaySessionPreview.map(session => {
              const presetName = presetsById.get(session.presetId)?.name ?? "未知番茄钟";
              const completedAt = session.endTime ?? session.updateTime;

              return (
                <div
                  key={session.id}
                  className={classNames(
                    "flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-xs",
                    themeColors.hoverClass
                  )}
                >
                  <Clock3
                    className={classNames("h-3 w-3 flex-shrink-0", themeColors.secondaryTextClass)}
                  />
                  <span
                    title={presetName}
                    className={classNames("min-w-0 flex-1 truncate", themeColors.textClass)}
                  >
                    {presetName}
                  </span>
                  <span
                    className={classNames(
                      "flex-shrink-0 tabular-nums",
                      themeColors.secondaryTextClass
                    )}
                  >
                    {new Date(completedAt).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span
                    className={classNames(
                      "flex-shrink-0 font-medium tabular-nums",
                      themeColors.activeTextClass
                    )}
                  >
                    {formatMs(session.focusMs)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className={classNames("text-xs", themeColors.secondaryTextClass)}>
            今天还没有完成的专注
          </p>
        )}
      </div>

      {/* 底部区域：计时中显示计时条，否则显示快捷开始 */}
      <div className="mt-auto">
        {isActive ? (
          <div
            className={classNames(
              "relative overflow-hidden rounded-lg border",
              themeColors.cardBorderClass
            )}
            style={{
              transition: "box-shadow 0.8s ease",
              boxShadow: isRunning ? `0 4px 16px -8px ${themeColors.accentSoftBg}` : "none",
            }}
          >
            {/* 强调色背景层 */}
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: themeColors.accentColor,
                opacity: isRunning ? 0.1 : 0.06,
              }}
            />
            {/* 进度条（倒计时模式） */}
            {activeSession?.expectedMs !== undefined && activeSession.expectedMs > 0 && (
              <div
                className="absolute inset-y-0 left-0"
                style={{
                  backgroundColor: themeColors.accentColor,
                  opacity: 0.08,
                  width: `${progress}%`,
                  transition: "width 1s linear",
                }}
              />
            )}
            <div className="relative px-3 py-2.5">
              <div
                className={classNames(
                  "mb-1.5 flex items-center gap-1.5 text-xs",
                  themeColors.secondaryTextClass
                )}
              >
                {isRunning ? (
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--th-accent)]" />
                ) : (
                  <Pause className="h-3 w-3 text-yellow-500" />
                )}
                <span>{isRunning ? "专注中" : "已暂停"}</span>
                <span className="truncate">· {activePreset?.name}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span
                  className={classNames(
                    "font-semibold tabular-nums tracking-wider",
                    themeColors.activeTextClass
                  )}
                  style={{ fontSize: 20, lineHeight: 1 }}
                >
                  {activeSession?.expectedMs !== undefined ? fmt(remainMs ?? 0) : fmt(elapsedMs)}
                </span>
                <div className="flex flex-none items-center gap-1">
                  {isRunning ? (
                    <button
                      onClick={onPauseSession}
                      title="暂停"
                      className={classNames(
                        "inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full transition-all",
                        themeColors.hoverClass,
                        themeColors.activeTextClass
                      )}
                    >
                      <Pause className="h-3 w-3" />
                    </button>
                  ) : (
                    <button
                      onClick={onResumeSession}
                      title="继续"
                      className={classNames(
                        "inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full transition-all",
                        themeColors.hoverClass,
                        themeColors.activeTextClass
                      )}
                    >
                      <Play className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    onClick={onStopSession}
                    title="停止"
                    className={classNames(
                      "inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full transition-all",
                      themeColors.hoverClass,
                      themeColors.textClass
                    )}
                  >
                    <Square className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          availablePresets.length > 0 && (
            <div className="space-y-1.5 overflow-hidden">
              <p className={classNames("mb-1.5 text-xs", themeColors.secondaryTextClass)}>
                快捷开始
              </p>
              <div className="flex flex-wrap gap-2">
                {availablePresets.map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      const expectedMs =
                        preset.mode === "countdown" ? preset.durationMin * 60000 : undefined;
                      onStartSession?.(preset.id, expectedMs);
                    }}
                    className={classNames(
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                      themeColors.cardBorderClass,
                      themeColors.hoverClass,
                      themeColors.textClass
                    )}
                  >
                    <Play className="h-3 w-3" />
                    {preset.name}
                    {preset.mode === "countdown" && (
                      <span className={themeColors.secondaryTextClass}>{preset.durationMin}m</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default PomodoroPanel;
