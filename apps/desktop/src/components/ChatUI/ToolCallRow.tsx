/**
 * 工具调用（D-048）：
 *  - ToolCallRow：通用折叠行「✓ tool_name · 1.2 秒」，失败 / 重试默认展开；展开看输入 / 输出 / 错误。
 *  - ToolCallBlock：接 shared 的渲染注册表——有自定义渲染器（日程、待办、检索……）走渲染器，
 *    否则落到 ToolCallRow；渲染器内部的 renderDefault() 也回到 ToolCallRow。
 * 状态只用语义色：成功 ok、失败 danger、重试 warn、执行中 accent 转圈、等待 / 取消 ink-3。
 */

import { memo, useState, type ReactNode } from "react";
import { Ban, Check, Clock, RotateCw, TriangleAlert, X } from "lucide-react";
import { ToolCallDisplay, type ToolCallExecutionState } from "@tau/shared";
import { Spinner, cn } from "@tau/ui";
import { FoldBody, FoldRow } from "./FoldRow";

const formatJson = (value: string) => {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};

export const formatToolDuration = (ms: number) =>
  ms < 1000 ? `${Math.round(ms)} 毫秒` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} 秒`;

function statusIcon(execution: ToolCallExecutionState): ReactNode {
  switch (execution.status) {
    case "pending":
      return <Clock strokeWidth={1.75} className="text-ink-3" />;
    case "executing":
      return <Spinner className="size-3 border-[1.5px]" />;
    case "retrying":
      return <RotateCw strokeWidth={1.75} className="text-warn animate-spin" />;
    case "cancelled":
      return <Ban strokeWidth={1.75} className="text-ink-3" />;
    case "success":
      return <Check strokeWidth={2} className="text-ok" />;
    case "failed":
      return execution.errorType === "parameter" ? (
        <TriangleAlert strokeWidth={1.75} />
      ) : (
        <X strokeWidth={2} />
      );
  }
}

export function toolStatusText(execution: ToolCallExecutionState): string {
  switch (execution.status) {
    case "pending":
      return "等待中";
    case "executing":
      return "执行中…";
    case "retrying":
      return execution.retryCount ? `重试中（${execution.retryCount}/2）` : "重试中";
    case "cancelled":
      return "已取消";
    case "success":
      return execution.duration ? formatToolDuration(execution.duration) : "完成";
    case "failed":
      if (execution.errorType === "parameter") return "参数错误";
      return execution.retryCount ? `重试 ${execution.retryCount} 次后失败` : "失败";
  }
}

function Section({
  label,
  children,
  danger,
}: {
  label: string;
  children: string;
  danger?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className={cn("text-tau-tiny mb-1", danger ? "text-danger" : "text-ink-3")}>{label}</div>
      <pre
        className={cn(
          "font-tau-mono rounded-tau-sm m-0 max-h-60 overflow-auto whitespace-pre-wrap break-all border px-2.5 py-2 text-[12px] leading-[1.6]",
          danger
            ? "border-danger/25 bg-danger-soft text-danger"
            : "border-line-1 bg-page text-ink-1"
        )}
      >
        {children}
      </pre>
    </div>
  );
}

export const ToolCallRow = memo(function ToolCallRow({
  execution,
}: {
  execution: ToolCallExecutionState;
}) {
  const [expanded, setExpanded] = useState(
    execution.status === "failed" || execution.status === "retrying"
  );
  const failed = execution.status === "failed";

  return (
    <div className="min-w-0">
      <FoldRow
        icon={statusIcon(execution)}
        title={<span className="font-tau-mono text-[12px]">{execution.toolName}</span>}
        meta={<span className="tabular-nums">{toolStatusText(execution)}</span>}
        tone={failed ? "danger" : "default"}
        expanded={expanded}
        onToggle={() => setExpanded(v => !v)}
      />
      {expanded && (
        <FoldBody className="space-y-2">
          {execution.input.trim() && <Section label="输入">{formatJson(execution.input)}</Section>}
          {execution.output && <Section label="输出">{execution.output}</Section>}
          {execution.error && (
            <Section label={execution.errorType === "parameter" ? "参数错误" : "错误"} danger>
              {execution.error}
            </Section>
          )}
        </FoldBody>
      )}
    </div>
  );
});

const renderDefaultItem = ({ execution }: { execution: ToolCallExecutionState }) => (
  <ToolCallRow execution={execution} />
);

/** 单条工具调用：自定义渲染器优先，缺省走 ToolCallRow */
export const ToolCallBlock = memo(function ToolCallBlock({
  execution,
  isDark,
  rendererContext,
}: {
  execution: ToolCallExecutionState;
  isDark: boolean;
  rendererContext?: Record<string, unknown>;
}) {
  return (
    <ToolCallDisplay
      executions={[execution]}
      isDark={isDark}
      // shared 外层自带 my-2 space-y-2 且用 classNames 拼接（不去重），这里用 important 覆盖
      className="my-0! space-y-0!"
      rendererContext={rendererContext}
      renderDefaultItem={renderDefaultItem}
    />
  );
});
