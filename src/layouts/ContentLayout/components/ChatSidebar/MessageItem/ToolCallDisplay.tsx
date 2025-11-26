import React, { useState } from "react";
import { ToolCallExecutionState } from "@/types";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import styles from "./ToolCallDisplay.module.less";

interface ToolCallDisplayProps {
  execution: ToolCallExecutionState;
  isDark: boolean;
}

const ToolCallDisplay: React.FC<ToolCallDisplayProps> = ({
  execution,
  isDark,
}) => {
  // 智能折叠：失败=展开，重试中=展开，成功=折叠
  const [isExpanded, setIsExpanded] = useState(
    execution.status === "failed" || execution.status === "retrying",
  );

  const getStatusIcon = () => {
    switch (execution.status) {
      case "pending":
        return <ClockCircleOutlined className={styles.iconPending} />;
      case "executing":
        return <LoadingOutlined className={styles.iconExecuting} spin />;
      case "retrying":
        return <ReloadOutlined className={styles.iconRetrying} spin />;
      case "success":
        return <CheckCircleOutlined className={styles.iconSuccess} />;
      case "failed":
        return <CloseCircleOutlined className={styles.iconFailed} />;
    }
  };

  const getStatusText = () => {
    switch (execution.status) {
      case "pending":
        return "Pending";
      case "executing":
        return "Executing...";
      case "retrying":
        return execution.retryCount
          ? `Retrying (${execution.retryCount}/${2})...`
          : "Retrying...";
      case "success":
        return execution.duration
          ? `Completed in ${execution.duration}ms`
          : "Completed";
      case "failed":
        return execution.retryCount
          ? `Failed after ${execution.retryCount} retries`
          : "Failed";
    }
  };

  const parseJsonSafe = (str: string) => {
    try {
      return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
      return str;
    }
  };

  return (
    <div className={`${styles.toolCallCard} ${isDark ? styles.dark : ""}`}>
      <div
        className={styles.toolCallHeader}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className={styles.headerLeft}>
          {getStatusIcon()}
          <span className={styles.toolName}>{execution.toolName}</span>
          <span className={styles.statusText}>{getStatusText()}</span>
        </div>
        <button className={styles.expandButton}>
          {isExpanded ? "▼" : "▶"}
        </button>
      </div>

      {isExpanded && (
        <div className={styles.toolCallBody}>
          {/* Input Section */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Input</div>
            <pre className={styles.codeBlock}>
              {parseJsonSafe(execution.input)}
            </pre>
          </div>

          {/* Output Section */}
          {execution.output && (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>Output</div>
              <pre className={styles.codeBlock}>{execution.output}</pre>
            </div>
          )}

          {/* Error Section */}
          {execution.error && (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>Error</div>
              <div className={styles.errorBlock}>{execution.error}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default React.memo(ToolCallDisplay);
