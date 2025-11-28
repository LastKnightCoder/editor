import React, { useEffect, useMemo } from "react";
import {
  pausePomodoroSession,
  resumePomodoroSession,
  stopPomodoroSession,
} from "@/commands";
import { closeWindow } from "@/commands/window";
import { usePomodoroStore } from "@/stores/usePomodoroStore";
import { useBackendWebsocketStore } from "@/stores/useBackendWebsocketStore";
import useInitDatabase from "@/hooks/useInitDatabase";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import { fmt } from "./utils";
import {
  AiOutlinePauseCircle,
  AiOutlinePlayCircle,
  AiOutlineClose,
} from "react-icons/ai";
import { IoStopCircleOutline } from "react-icons/io5";
import useThemeColors from "@/hooks/useThemeColors";

import classNames from "classnames";

interface CircularProgressProps {
  progress: number; // 0-100
  color: string;
  size: number;
  strokeWidth: number;
}

const CircularProgress: React.FC<CircularProgressProps> = ({
  progress,
  color,
  size,
  strokeWidth,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-300"
      />
    </svg>
  );
};

const Mini: React.FC = () => {
  useInitDatabase();
  const isConnected = useDatabaseConnected();
  const { activeSession, elapsedMs, remainMs, initPomodoro, inited, presets } =
    usePomodoroStore();
  const { client } = useBackendWebsocketStore();
  const themeColors = useThemeColors();

  useEffect(() => {
    if (isConnected) {
      if (!inited) {
        initPomodoro();
      }
    }
  }, [initPomodoro, inited, isConnected]);

  // 监听番茄钟结束，自动关闭窗口
  useEffect(() => {
    if (!client) return;

    const handler = (session: unknown) => {
      // 当 activeSession 从有变为 null 时，说明番茄钟结束
      if (!session) {
        closeWindow();
      }
    };

    client.registerNotificationHandler(
      "pomodoro:active-session-changed",
      handler,
    );

    return () => {
      client.unregisterNotificationHandler(
        "pomodoro:active-session-changed",
        handler,
      );
    };
  }, [client]);

  const presetName = useMemo(() => {
    if (!activeSession) return "";
    const preset = presets.find((p) => p.id === activeSession.presetId);
    return preset?.name || "未知预设";
  }, [activeSession, presets]);

  // 计算进度
  const progress = useMemo(() => {
    if (!activeSession) return 0;
    if (
      activeSession.expectedMs !== undefined &&
      activeSession.expectedMs > 0
    ) {
      // 倒计时模式：基于剩余时间
      return (
        ((activeSession.expectedMs - (remainMs ?? 0)) /
          activeSession.expectedMs) *
        100
      );
    }
    // 正计时模式：无进度显示
    return 0;
  }, [activeSession, remainMs]);

  // 颜色配置
  const progressColor = useMemo(() => {
    if (!activeSession) return "#10b981";
    return activeSession.status === "running" ? "#10b981" : "#fb923c";
  }, [activeSession]);

  if (!activeSession)
    return (
      <div
        className={classNames(
          "p-3 text-sm app-region-drag transition-colors",
          themeColors.textClass,
        )}
      >
        未在计时
      </div>
    );

  return (
    <div className="relative flex items-center gap-3 p-3 w-full h-full app-region-drag group">
      <div className="relative shrink-0">
        <CircularProgress
          progress={progress}
          color={progressColor}
          size={70}
          strokeWidth={3}
        />
        <div className="absolute inset-0 flex items-center justify-center app-region-no-drag">
          {activeSession.status === "running" ? (
            // 专注态：只显示暂停按钮
            <button
              className={classNames(
                "transition-colors",
                themeColors.activeTextClass,
                themeColors.hoverTextClass,
              )}
              onClick={() => pausePomodoroSession()}
              title="暂停"
            >
              <AiOutlinePauseCircle className="text-3xl" />
            </button>
          ) : (
            // 暂停态：显示播放和停止按钮
            <div className="flex items-center gap-1">
              <button
                className={classNames(
                  "transition-colors",
                  themeColors.activeTextClass,
                  themeColors.hoverTextClass,
                )}
                onClick={() => resumePomodoroSession()}
                title="继续"
              >
                <AiOutlinePlayCircle className="text-2xl" />
              </button>
              <button
                className={classNames(
                  "transition-colors",
                  themeColors.textClass,
                  themeColors.hoverTextClass,
                )}
                onClick={() => {
                  stopPomodoroSession(true);
                  closeWindow();
                }}
                title="停止"
              >
                <IoStopCircleOutline className="text-2xl" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center min-w-0 w-fit app-region-no-drag">
        <div
          className={classNames(
            "text-sm truncate w-fit app-region-drag transition-colors",
            themeColors.textClass,
          )}
        >
          {presetName}
        </div>
        <div
          className={classNames(
            "text-2xl font-bold app-region-drag transition-colors",
            themeColors.activeTextClass,
          )}
        >
          {activeSession.expectedMs !== undefined
            ? fmt(remainMs ?? 0)
            : fmt(elapsedMs)}
        </div>
      </div>

      <button
        className={classNames(
          "absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all duration-200 app-region-no-drag cursor-pointer",
          themeColors.textClass,
          themeColors.hoverTextClass,
        )}
        onClick={() => closeWindow()}
        title="关闭窗口"
      >
        <AiOutlineClose className="text-base" />
      </button>
    </div>
  );
};

export default Mini;
