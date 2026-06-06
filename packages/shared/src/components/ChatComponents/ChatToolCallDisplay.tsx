import React, { memo, useState } from "react";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  LoadingOutlined,
  ReloadOutlined,
  StopOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import type {
  ToolCallDefaultItemRenderParams,
  ToolCallDisplayProps as BaseToolCallDisplayProps,
} from "./ToolCallDisplay";
import { ToolCallDisplay } from "./ToolCallDisplay";
import type { ToolCallExecutionState } from "./types";
import styles from "./ChatToolCallDisplay.module.less";

export interface ChatToolCallDefaultItemProps {
  execution: ToolCallExecutionState;
  isDark: boolean;
}

export interface ChatToolCallDisplayProps extends Omit<
  BaseToolCallDisplayProps,
  "executions" | "renderDefaultItem"
> {
  execution: ToolCallExecutionState;
}

const parseJsonSafe = (str: string) => {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
};

export const ChatToolCallDefaultItem: React.FC<ChatToolCallDefaultItemProps> =
  memo(function ChatToolCallDefaultItem({ execution, isDark }) {
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
        case "cancelled":
          return <StopOutlined className={styles.iconPending} />;
        case "success":
          return <CheckCircleOutlined className={styles.iconSuccess} />;
        case "failed":
          return execution.errorType === "parameter" ? (
            <WarningOutlined className={styles.iconFailed} />
          ) : (
            <CloseCircleOutlined className={styles.iconFailed} />
          );
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
          if (execution.errorType === "parameter") {
            return "Parameter error";
          }
          return execution.retryCount
            ? `Failed after ${execution.retryCount} retries`
            : "Failed";
        case "cancelled":
          return "Cancelled";
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
          <button type="button" className={styles.expandButton}>
            {isExpanded ? "▼" : "▶"}
          </button>
        </div>

        {isExpanded && (
          <div className={styles.toolCallBody}>
            <div className={styles.section}>
              <div className={styles.sectionLabel}>Input</div>
              <pre className={styles.codeBlock}>
                {parseJsonSafe(execution.input)}
              </pre>
            </div>

            {execution.output && (
              <div className={styles.section}>
                <div className={styles.sectionLabel}>Output</div>
                <pre className={styles.codeBlock}>{execution.output}</pre>
              </div>
            )}

            {execution.error && (
              <div className={styles.section}>
                <div className={styles.sectionLabel}>
                  {execution.errorType === "parameter"
                    ? "Parameter Error"
                    : "Error"}
                </div>
                <div className={styles.errorBlock}>{execution.error}</div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  });

const renderChatDefaultItem = ({
  execution,
  isDark,
}: ToolCallDefaultItemRenderParams) => (
  <ChatToolCallDefaultItem execution={execution} isDark={isDark} />
);

export const ChatToolCallDisplay: React.FC<ChatToolCallDisplayProps> = memo(
  function ChatToolCallDisplay({
    execution,
    isDark,
    className = "my-0 space-y-0",
    ...props
  }) {
    return (
      <ToolCallDisplay
        {...props}
        executions={[execution]}
        isDark={isDark}
        className={className}
        renderDefaultItem={renderChatDefaultItem}
      />
    );
  },
);

export default ChatToolCallDisplay;
