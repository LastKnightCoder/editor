import React, { useState, useEffect, memo, useCallback } from "react";
import classNames from "classnames";

export interface ReasoningDisplayProps {
  /** 推理内容 */
  content: string;
  /** 是否为暗色主题 */
  isDark?: boolean;
  /** 开始时间戳（毫秒） */
  startTime?: number;
  /** 结束时间戳（毫秒） */
  endTime?: number;
  /** 总持续时间（毫秒），优先使用 */
  duration?: number;
  /** 默认是否展开 */
  defaultExpanded?: boolean;
  /** 自定义内容渲染器 */
  renderContent?: (content: string) => React.ReactNode;
  /** 思考图标组件 */
  ThinkingIcon?: React.ComponentType<{ className?: string }>;
  /** 加载图标组件 */
  LoadingIcon?: React.ComponentType<{ className?: string; spin?: boolean }>;
  className?: string;
}

/** 默认思考图标 */
const DefaultThinkingIcon: React.FC<{ className?: string }> = ({
  className,
}) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
  </svg>
);

/** 默认加载图标 */
const DefaultLoadingIcon: React.FC<{ className?: string; spin?: boolean }> = ({
  className,
  spin,
}) => (
  <svg
    className={classNames(className, spin && "animate-spin")}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12a9 9 0 11-6.219-8.56" />
  </svg>
);

/** 格式化持续时间 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    return `${hours}小时${remainingMinutes}分${remainingSeconds}秒`;
  } else if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}分${remainingSeconds}秒`;
  } else if (seconds > 0) {
    return `${seconds}秒`;
  } else {
    return `${ms}毫秒`;
  }
}

export const ReasoningDisplay: React.FC<ReasoningDisplayProps> = memo(
  function ReasoningDisplay({
    content,
    isDark = false,
    startTime,
    endTime,
    duration,
    defaultExpanded = false,
    renderContent,
    ThinkingIcon = DefaultThinkingIcon,
    LoadingIcon = DefaultLoadingIcon,
    className,
  }) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const [currentDuration, setCurrentDuration] = useState(0);

    // 判断是否正在思考中
    const isThinking = startTime !== undefined && endTime === undefined;

    // 实时更新思考用时
    useEffect(() => {
      if (!isThinking || !startTime) return;

      const updateTimer = () => {
        setCurrentDuration(Date.now() - startTime);
      };

      updateTimer();
      const timer = setInterval(updateTimer, 100);

      return () => clearInterval(timer);
    }, [isThinking, startTime]);

    // 显示的用时
    const displayDuration = duration ?? currentDuration;

    const toggle = useCallback(() => setIsExpanded((prev) => !prev), []);

    if (!content) return null;

    return (
      <div
        className={classNames(
          "my-2 rounded-lg border",
          isDark
            ? "bg-purple-900/20 border-purple-800/30"
            : "bg-purple-50 border-purple-200",
          className,
        )}
      >
        <div
          className="flex items-center justify-between px-3 py-2 cursor-pointer"
          onClick={toggle}
        >
          <div className="flex items-center gap-2">
            {isThinking ? (
              <LoadingIcon className="text-purple-500" spin />
            ) : (
              <ThinkingIcon className="text-purple-500" />
            )}
            <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
              {isThinking ? "思考中" : "已思考"}
            </span>
            {(startTime || duration) && displayDuration > 0 && (
              <span className="text-xs text-gray-400">
                {formatDuration(displayDuration)}
              </span>
            )}
          </div>
          <span className="text-xs text-gray-400">
            {isExpanded ? "收起" : "展开"}
          </span>
        </div>

        {isExpanded && (
          <div
            className={classNames(
              "px-3 pb-3 text-sm whitespace-pre-wrap",
              isDark ? "text-gray-300" : "text-gray-600",
            )}
          >
            {renderContent ? renderContent(content) : content}
          </div>
        )}
      </div>
    );
  },
);

export default ReasoningDisplay;
