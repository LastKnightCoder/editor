import React, { memo } from "react";
import classNames from "classnames";
import type { ToolCallStatus } from "./types";

export interface StatusBadgeProps {
  status: ToolCallStatus;
  /** 自定义状态文本映射 */
  statusText?: Partial<Record<ToolCallStatus, string>>;
  className?: string;
}

/** 默认状态文本 */
const defaultStatusText: Record<ToolCallStatus, string> = {
  pending: "等待",
  executing: "执行中",
  success: "成功",
  failed: "失败",
  retrying: "重试",
  cancelled: "已取消",
  "awaiting-approval": "等待确认",
};

/** 状态颜色映射 */
const statusColors: Record<ToolCallStatus, string> = {
  pending: "bg-gray-500",
  executing: "bg-blue-500",
  success: "bg-green-500",
  failed: "bg-red-500",
  retrying: "bg-yellow-500",
  cancelled: "bg-gray-500",
  "awaiting-approval": "bg-yellow-500",
};

export const StatusBadge: React.FC<StatusBadgeProps> = memo(function StatusBadge({
  status,
  statusText,
  className,
}) {
  const text = statusText?.[status] ?? defaultStatusText[status];

  return (
    <span
      className={classNames(
        "rounded px-1.5 py-0.5 text-xs text-white",
        statusColors[status],
        className
      )}
    >
      {text}
    </span>
  );
});

export default StatusBadge;
