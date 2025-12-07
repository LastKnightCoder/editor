import React, { memo } from "react";
import { Progress } from "antd";
import { ColumnDef } from "../../../types";
import { ProgressValue } from "../types";

interface ProgressRendererProps {
  value: ProgressValue;
  column: ColumnDef;
  theme: "light" | "dark";
  readonly: boolean;
  onCellValueChange: (newValue: ProgressValue) => void;
}

const ProgressRenderer: React.FC<ProgressRendererProps> = memo(
  ({ value, theme }) => {
    // 确保 value 是正确的格式
    const progressValue =
      value &&
      typeof value === "object" &&
      "current" in value &&
      "target" in value
        ? (value as ProgressValue)
        : { current: 0, target: 100 };

    // 计算百分比
    const percent =
      progressValue.target > 0
        ? Math.min(
            100,
            Math.round((progressValue.current / progressValue.target) * 100),
          )
        : 0;

    const isDark = theme === "dark";

    // 渐变色配置
    const gradientConfig = isDark
      ? {
          from: "#60a5fa", // 蓝色
          to: "#34d399", // 绿色
        }
      : {
          from: "#3b82f6", // 蓝色
          to: "#10b981", // 绿色
        };

    return (
      <div className="flex items-center gap-2 px-2 py-1 h-full w-full">
        <Progress
          percent={percent}
          size="small"
          showInfo={false}
          format={(percent?: number) => `${percent || 0}%`}
          strokeColor={gradientConfig}
          trailColor={isDark ? "#374151" : "#f3f4f6"}
          style={{ flex: 1 }}
        />

        <div
          className={`text-xs font-mono ${isDark ? "text-gray-300" : "text-gray-600"}`}
        >
          {progressValue.current}/{progressValue.target}
        </div>
      </div>
    );
  },
);

ProgressRenderer.displayName = "ProgressRenderer";

export default ProgressRenderer;
