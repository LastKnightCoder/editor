import { memo } from "react";
import { motion } from "motion/react";
import {
  Sparkles,
  Loader2,
  Check,
  Search,
  BookOpen,
  FileText,
} from "lucide-react";
import classNames from "classnames";

import type { ToolCallExecutionState } from "@/types";

interface GeneratingProgressProps {
  /** 状态文字 */
  statusText?: string;
  /** 已生成的数量（可选，用于显示进度） */
  generatedCount?: number;
  /** 已生成数量的单位 */
  generatedUnit?: string;
  /** 工具调用状态列表（可选） */
  toolExecutions?: ToolCallExecutionState[];
  /** 停止按钮点击回调 */
  onStop?: () => void;
  /** 停止按钮文字 */
  stopButtonText?: string;
  /** 是否显示停止按钮 */
  showStopButton?: boolean;
}

/** 工具名称到中文描述的映射 */
const TOOL_NAME_MAP: Record<string, string> = {
  list_project_resources: "获取资源列表",
  read_resource_content: "读取资源内容",
  read_resource_range: "分段读取内容",
  search_project_knowledge: "搜索知识库",
};

/** 根据工具名称获取对应图标 */
const getToolIcon = (toolName: string) => {
  switch (toolName) {
    case "search_project_knowledge":
      return <Search className="w-3 h-3 inline mr-1" />;
    case "read_resource_content":
      return <BookOpen className="w-3 h-3 inline mr-1" />;
    case "read_resource_range":
      return <FileText className="w-3 h-3 inline mr-1" />;
    default:
      return null;
  }
};

/**
 * 生成进度组件
 * 显示生成过程中的状态和进度
 */
const GeneratingProgress = memo((props: GeneratingProgressProps) => {
  const {
    statusText = "正在生成中...",
    generatedCount,
    generatedUnit = "项",
    toolExecutions = [],
    onStop,
    stopButtonText = "停止生成",
    showStopButton = true,
  } = props;

  // 计算工具调用进度
  const completedCount = toolExecutions.filter(
    (t) => t.status === "success",
  ).length;
  const totalCount = toolExecutions.length;

  return (
    <div className="flex flex-col items-center justify-center py-12">
      {/* 动画图标 */}
      <div className="relative">
        <div className="w-20 h-20 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
          <Sparkles className="w-8 h-8 text-blue-500 animate-pulse" />
        </div>
        <motion.div
          className="absolute inset-0 w-20 h-20 rounded-full border-2 border-blue-500 border-t-transparent"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </div>

      {/* 状态文字 */}
      <p className="text-base font-medium text-gray-700 dark:text-gray-200 mt-6">
        {statusText}
      </p>

      {/* 已生成数量 */}
      {generatedCount !== undefined && generatedCount > 0 && (
        <motion.p
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm text-blue-500 mt-2 font-medium"
        >
          已生成 {generatedCount} {generatedUnit}
        </motion.p>
      )}

      {/* 工具调用进度 */}
      {toolExecutions.length > 0 && (
        <div className="w-full max-w-xs mt-4">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
            <span>资料获取进度</span>
            <span>
              {completedCount}/{totalCount}
            </span>
          </div>
          <div className="space-y-1.5 max-h-32 overflow-auto">
            {toolExecutions.slice(-5).map((execution) => (
              <motion.div
                key={execution.toolCallId}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2 text-xs"
              >
                {execution.status === "executing" ? (
                  <Loader2 className="w-3 h-3 text-blue-500 animate-spin shrink-0" />
                ) : execution.status === "success" ? (
                  <Check className="w-3 h-3 text-green-500 shrink-0" />
                ) : execution.status === "pending" ? (
                  <div className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600 shrink-0" />
                ) : (
                  <div className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
                )}
                <span
                  className={classNames(
                    "truncate",
                    execution.status === "executing"
                      ? "text-blue-600 dark:text-blue-400"
                      : execution.status === "success"
                        ? "text-gray-500 dark:text-gray-400"
                        : "text-gray-400 dark:text-gray-500",
                  )}
                >
                  {getToolIcon(execution.toolName)}
                  {TOOL_NAME_MAP[execution.toolName] || execution.toolName}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* 停止按钮 */}
      {showStopButton && onStop && (
        <button
          type="button"
          onClick={onStop}
          className={classNames(
            "mt-6 px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
            "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300",
            "hover:bg-gray-200 dark:hover:bg-zinc-700",
            "border border-gray-200 dark:border-gray-700",
          )}
        >
          {stopButtonText}
        </button>
      )}
    </div>
  );
});

GeneratingProgress.displayName = "GeneratingProgress";

export default GeneratingProgress;
