import React from "react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";
import { Timer, Play, Pause } from "lucide-react";
import type { PomodoroPreset, PomodoroSession } from "@/types/pomodoro";

interface PomodoroPanelProps {
  todayStats: { count: number; focusMs: number };
  activeSession: PomodoroSession | null;
  presets: PomodoroPreset[];
  onStartSession?: (presetId: number, expectedMs?: number) => void;
}

const PomodoroPanel: React.FC<PomodoroPanelProps> = ({
  todayStats,
  activeSession,
  presets,
  onStartSession,
}) => {
  const themeColors = useThemeColors();

  const formatMs = (ms: number): string => {
    const totalMinutes = Math.round(ms / 60000);
    if (totalMinutes < 60) return `${totalMinutes}分钟`;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const formatCountdown = (session: PomodoroSession): string => {
    if (!session.expectedMs) return formatMs(session.focusMs);
    const elapsed = Date.now() - session.startTime - session.pauseTotalMs;
    const remaining = Math.max(0, session.expectedMs - elapsed);
    const mins = Math.ceil(remaining / 60000);
    return `${mins}分钟`;
  };

  // Show only non-archived presets, max 3
  const availablePresets = presets.filter((p) => !p.archived).slice(0, 3);

  return (
    <div
      className={classNames(
        "rounded-xl border p-4 h-[260px] flex flex-col",
        themeColors.cardBorderClass,
        themeColors.cardBgClass,
      )}
    >
      {/* 标题行 */}
      <div className="flex items-center gap-2.5 mb-3">
        <div
          className={classNames(
            "w-8 h-8 rounded-lg flex items-center justify-center",
            themeColors.iconBgClass,
          )}
        >
          <Timer className={classNames("w-4 h-4", themeColors.iconTextClass)} />
        </div>
        <h3
          className={classNames("text-sm font-semibold", themeColors.textClass)}
        >
          番茄钟
        </h3>
      </div>

      {/* 进行中 session */}
      {activeSession &&
        (activeSession.status === "running" ||
          activeSession.status === "paused") && (
          <div
            className={classNames(
              "rounded-lg p-3 mb-3 border",
              themeColors.cardBorderClass,
              "bg-gradient-to-br from-[var(--th-active-from)] to-[var(--th-active-to)]",
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {activeSession.status === "running" ? (
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                ) : (
                  <Pause className="w-3.5 h-3.5 text-yellow-500" />
                )}
                <span
                  className={classNames(
                    "text-sm font-medium",
                    themeColors.activeTextClass,
                  )}
                >
                  {activeSession.status === "running" ? "专注中" : "已暂停"}
                </span>
              </div>
              <span
                className={classNames(
                  "text-lg font-bold tabular-nums",
                  themeColors.activeTextClass,
                )}
              >
                {formatCountdown(activeSession)}
              </span>
            </div>
          </div>
        )}

      {/* 今日统计 */}
      <div className="flex items-baseline gap-1.5 mb-3">
        <span
          className={classNames(
            "text-2xl font-bold tabular-nums",
            themeColors.textClass,
          )}
        >
          {formatMs(todayStats.focusMs)}
        </span>
        <span className={classNames("text-xs", themeColors.secondaryTextClass)}>
          今日专注 · {todayStats.count} 次
        </span>
      </div>

      {/* 快捷开始 */}
      {!activeSession && availablePresets.length > 0 && (
        <div className="mt-auto space-y-1.5 overflow-hidden">
          <p
            className={classNames(
              "text-xs mb-1.5",
              themeColors.secondaryTextClass,
            )}
          >
            快捷开始
          </p>
          <div className="flex flex-wrap gap-2">
            {availablePresets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => {
                  const expectedMs =
                    preset.mode === "countdown"
                      ? preset.durationMin * 60000
                      : undefined;
                  onStartSession?.(preset.id, expectedMs);
                }}
                className={classNames(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                  themeColors.cardBorderClass,
                  themeColors.hoverClass,
                  themeColors.textClass,
                )}
              >
                <Play className="w-3 h-3" />
                {preset.name}
                {preset.mode === "countdown" && (
                  <span className={themeColors.secondaryTextClass}>
                    {preset.durationMin}m
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PomodoroPanel;
