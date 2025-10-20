import React, { useEffect, useMemo } from "react";
import {
  pausePomodoroSession,
  resumePomodoroSession,
  stopPomodoroSession,
} from "@/commands";
import { closeWindow } from "@/commands/window";
import { usePomodoroStore } from "@/stores/usePomodoroStore";
import useInitDatabase from "@/hooks/useInitDatabase";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import { fmt } from "./utils";
import {
  AiOutlinePauseCircle,
  AiOutlinePlayCircle,
  AiOutlineClose,
} from "react-icons/ai";
import { IoStopCircleOutline } from "react-icons/io5";

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

  useEffect(() => {
    if (isConnected) {
      if (!inited) {
        initPomodoro();
      }
    }
  }, [initPomodoro, inited, isConnected]);

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
      <div className="p-3 text-sm text-gray-600 app-region-drag">未在计时</div>
    );

  return (
    <div className="relative flex items-center gap-3 p-3 w-full h-full app-region-drag group">
      <div className="relative flex-shrink-0">
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
              className="text-green-600 hover:text-green-500 transition-colors"
              onClick={() => pausePomodoroSession()}
              title="暂停"
            >
              <AiOutlinePauseCircle className="text-3xl" />
            </button>
          ) : (
            // 暂停态：显示播放和停止按钮
            <div className="flex items-center gap-1">
              <button
                className="text-orange-600 hover:text-orange-500 transition-colors"
                onClick={() => resumePomodoroSession()}
                title="继续"
              >
                <AiOutlinePlayCircle className="text-2xl" />
              </button>
              <button
                className="text-gray-600 hover:text-gray-500 transition-colors"
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
        <div className="text-sm text-gray-600 truncate w-fit app-region-drag">
          {presetName}
        </div>
        <div className="text-2xl font-bold text-gray-800 app-region-drag">
          {activeSession.expectedMs !== undefined
            ? fmt(remainMs ?? 0)
            : fmt(elapsedMs)}
        </div>
      </div>

      <button
        className={classNames(
          "absolute top-2 right-2 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-gray-600 transition-all duration-200 app-region-no-drag cursor-pointer",
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
