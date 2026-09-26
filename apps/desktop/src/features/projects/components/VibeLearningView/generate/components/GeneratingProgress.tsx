import { memo } from "react";
import { motion } from "motion/react";
import { Sparkles, Loader2, Check, Search, BookOpen, FileText, FileCode2 } from "lucide-react";
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
  vibe_learning_query: "查询项目资料",
  list_project_resources: "获取资源列表",
  read_resource_content: "读取资源内容",
  read_resource_lines: "按行补读内容",
  read_resource_range: "按字符补读内容",
  search_resource_content: "语义搜索资料",
  grep_resource_content: "精确搜索资料",
  batch_search_project_knowledge: "批量搜索资料",
  batch_read_search_hits: "批量补读上下文",
};

const getToolLabel = (execution: ToolCallExecutionState) => {
  if (execution.toolName !== "vibe_learning_query")
    return TOOL_NAME_MAP[execution.toolName] || execution.toolName;
  try {
    const input = JSON.parse(execution.input || "{}") as { operation?: string };
    const operationLabels: Record<string, string> = {
      list: "获取资源列表",
      search: "语义搜索资料",
      grep: "精确搜索资料",
      read: "读取资源内容",
      read_lines: "按行补读内容",
      read_range: "按字符补读内容",
      batch_search: "批量搜索资料",
      batch_read: "批量补读上下文",
    };
    return operationLabels[input.operation ?? ""] || TOOL_NAME_MAP[execution.toolName];
  } catch {
    return TOOL_NAME_MAP[execution.toolName];
  }
};

/** 根据工具名称获取对应图标 */
const getToolIcon = (toolName: string) => {
  switch (toolName) {
    case "vibe_learning_query":
    case "search_resource_content":
    case "grep_resource_content":
      return <Search className="mr-1 inline h-3 w-3" strokeWidth={1.75} />;
    case "batch_search_project_knowledge":
      return <Search className="mr-1 inline h-3 w-3" strokeWidth={1.75} />;
    case "batch_read_search_hits":
      return <FileText className="mr-1 inline h-3 w-3" strokeWidth={1.75} />;
    case "read_resource_content":
      return <BookOpen className="mr-1 inline h-3 w-3" strokeWidth={1.75} />;
    case "read_resource_lines":
    case "read_resource_range":
      return <FileText className="mr-1 inline h-3 w-3" strokeWidth={1.75} />;
    default:
      return null;
  }
};

const formatHtmlSize = (content: string) => {
  const bytes =
    typeof TextEncoder !== "undefined" ? new TextEncoder().encode(content).length : content.length;
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
  const completedCount = toolExecutions.filter(t => t.status === "success").length;
  const totalCount = toolExecutions.length;
  const hasOutputText = outputText.trim().length > 0;
  const outputSize = hasOutputText ? formatHtmlSize(outputText) : "0 KB";
  const shouldShowToolProgress = !hasOutputText && toolExecutions.length > 0;

  return (
    <div className="flex flex-col items-center justify-center py-12">
      {/* 动画图标 */}
      <div className="relative">
        <div className="bg-accent-soft flex h-20 w-20 items-center justify-center rounded-full">
          <Sparkles className="text-accent h-8 w-8 animate-pulse" strokeWidth={1.75} />
        </div>
        <motion.div
          className="border-accent absolute inset-0 h-20 w-20 rounded-full border-2 border-t-transparent"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </div>

      {/* 状态文字 */}
      <p className="text-ink-2 mt-6 text-base font-medium">{statusText}</p>

      {/* 已生成数量 */}
      {generatedCount !== undefined && generatedCount > 0 && (
        <motion.p
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-accent mt-2 text-sm font-medium"
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
            "border-line-1 bg-accent-soft border px-4 py-3",
            "border-accent/20 text-accent-text"
          )}
        >
          <FileCode2 className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          <div className="min-w-0">
            <div className="text-accent text-[11px] font-medium">{outputLabel} 大小</div>
            <div className="text-ink-1 text-base font-semibold">{outputSize}</div>
          </div>
        </motion.div>
      )}

      {/* 工具调用进度 */}
      {shouldShowToolProgress && (
        <div className="mt-4 w-full max-w-xs">
          <div className="text-ink-2 mb-2 flex items-center justify-between text-xs">
            <span>资料获取进度</span>
            <span>
              {completedCount}/{totalCount}
            </span>
          </div>
          <div className="space-y-1.5">
            {toolExecutions.slice(-5).map(execution => (
              <motion.div
                key={execution.toolCallId}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2 text-xs"
              >
                {execution.status === "executing" ? (
                  <Loader2
                    className="text-accent h-3 w-3 shrink-0 animate-spin"
                    strokeWidth={1.75}
                  />
                ) : execution.status === "success" ? (
                  <Check className="text-status-success h-3 w-3 shrink-0" strokeWidth={1.75} />
                ) : execution.status === "pending" ? (
                  <div className="border-line-1 h-3 w-3 shrink-0 rounded-full border" />
                ) : (
                  <div className="h-3 w-3 shrink-0 rounded-full bg-red-500" />
                )}
                <span
                  className={classNames(
                    "truncate",
                    execution.status === "executing"
                      ? "text-accent-text"
                      : execution.status === "success"
                        ? "text-ink-2"
                        : "text-ink-3"
                  )}
                >
                  {getToolIcon(execution.toolName)}
                  {getToolLabel(execution)}
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
            "mt-6 rounded-xl px-5 py-2.5 text-sm font-medium transition-all",
            "bg-hover text-ink-2",
            "hover:bg-hover",
            "border-line-1 border"
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
