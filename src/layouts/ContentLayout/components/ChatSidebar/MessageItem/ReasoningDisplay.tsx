import React, { useState, useEffect } from "react";
import MarkdownRenderer from "../MarkdownRenderer";
import { BulbOutlined, LoadingOutlined } from "@ant-design/icons";
import styles from "./ReasoningDisplay.module.less";

interface ReasoningDisplayProps {
  content: string;
  isDark: boolean;
  markdownComponents: any;
  isVisible: boolean;
  startTime?: number;
  endTime?: number;
  duration?: number;
}

// 格式化持续时间
const formatDuration = (ms: number): string => {
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
  } else {
    return `${seconds}秒`;
  }
};

const ReasoningDisplay: React.FC<ReasoningDisplayProps> = ({
  content,
  isDark,
  markdownComponents,
  isVisible,
  startTime,
  endTime,
  duration,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentDuration, setCurrentDuration] = useState(0);

  // 判断是否正在思考中
  const isThinking = startTime && !endTime;

  // 实时更新思考用时
  useEffect(() => {
    if (!isThinking) return;

    const updateTimer = () => {
      if (startTime) {
        setCurrentDuration(Date.now() - startTime);
      }
    };

    // 立即更新一次
    updateTimer();

    // 每100ms更新一次
    const timer = setInterval(updateTimer, 100);

    return () => clearInterval(timer);
  }, [isThinking, startTime]);

  // 显示的用时
  const displayDuration = duration || currentDuration;

  return (
    <div className={`${styles.reasoningCard} ${isDark ? styles.dark : ""}`}>
      <div
        className={styles.reasoningHeader}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className={styles.headerContent}>
          {isThinking ? (
            <LoadingOutlined className={styles.icon} spin />
          ) : (
            <BulbOutlined className={styles.icon} />
          )}
          <span className={styles.title}>
            {isThinking ? "思考中" : "已思考"}
          </span>
          {startTime && (
            <span className={styles.duration}>
              {formatDuration(displayDuration)}
            </span>
          )}
        </div>
        <button className={styles.expandButton}>
          {isExpanded ? "▼" : "▶"}
        </button>
      </div>

      {isExpanded && (
        <div className={styles.reasoningBody}>
          <MarkdownRenderer
            content={content}
            className={styles.markdown}
            markdownComponents={markdownComponents}
            shouldRender={isVisible}
          />
        </div>
      )}
    </div>
  );
};

export default React.memo(ReasoningDisplay);
