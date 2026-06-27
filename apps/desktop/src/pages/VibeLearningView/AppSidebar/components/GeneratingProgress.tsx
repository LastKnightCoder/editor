import { memo } from "react";
import { motion } from "motion/react";
import {
  Sparkles,
  Loader2,
  Check,
  Search,
  BookOpen,
  FileText,
  FileCode2,
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
  /** 正在流式输出的内容，用于展示产物体积 */
  outputText?: string;
  /** 输出内容类型标签 */
  outputLabel?: string;
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
  read_resource_lines: "按行补读内容",
  read_resource_range: "按字符补读内容",
  search_resource_content: "语义搜索资料",
  grep_resource_content: "精确搜索资料",
  batch_search_project_knowledge: "批量搜索资料",
  batch_read_search_hits: "批量补读上下文",
};

/** 根据工具名称获取对应图标 */
const getToolIcon = (toolName: string) => {
  switch (toolName) {
    case "search_resource_content":
    case "grep_resource_content":
      return <Search className="w-3 h-3 inline mr-1" />;
    case "batch_search_project_knowledge":
      return <Search className="w-3 h-3 inline mr-1" />;
    case "batch_read_search_hits":
      return <FileText className="w-3 h-3 inline mr-1" />;
    case "read_resource_content":
      return <BookOpen className="w-3 h-3 inline mr-1" />;
    case "read_resource_lines":
    case "read_resource_range":
      return <FileText className="w-3 h-3 inline mr-1" />;
    default:
      return null;
  }
};

const formatHtmlSize = (content: string) => {
  const bytes =
    typeof TextEncoder !== "undefined"
      ? new TextEncoder().encode(content).length
      : content.length;
  return `${(bytes / 1024).toFixed(1)} KB`;
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
    outputText = "",
    outputLabel = "HTML",
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
  const hasOutputText = outputText.trim().length > 0;
  const outputSize = hasOutputText ? formatHtmlSize(outputText) : "0 KB";
  const shouldShowToolProgress = !hasOutputText && toolExecutions.length > 0;

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

      {/* 流式输出指标 */}
      {hasOutputText && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className={classNames(
            "mt-4 flex w-full max-w-xs items-center gap-3 rounded-xl",
            "border border-blue-100 bg-blue-50/70 px-4 py-3",
            "text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200",
          )}
        >
          <FileCode2 className="h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-blue-500 dark:text-blue-300">
              {outputLabel} 大小
            </div>
            <div className="text-base font-semibold text-gray-800 dark:text-gray-100">
              {outputSize}
            </div>
          </div>
        </motion.div>
      )}

      {/* 工具调用进度 */}
      {shouldShowToolProgress && (
        <div className="w-full max-w-xs mt-4">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
            <span>资料获取进度</span>
            <span>
              {completedCount}/{totalCount}
            </span>
          </div>
          <div className="space-y-1.5">
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
