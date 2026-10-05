/**
 * 工具调用折叠行（D-048）：「✓ tool_name · 1.2 秒」，失败 / 重试默认展开；展开看输入 / 输出 / 错误。
 * 也是 ToolCallDisplay 的缺省单项与自定义渲染器 renderDefault() 的落点。
 * 状态只用语义色：成功 ok、失败 danger、重试 warn、执行中 accent 转圈、等待 / 取消 ink-3。
 */

import { memo, useState, type ReactNode } from "react";
import { Ban, Check, Clock, RotateCw, ShieldQuestion, TriangleAlert, X } from "lucide-react";
import type { ToolCallExecutionState } from "@tau/shared/chat-renderers";
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
    case "awaiting-approval":
      return <ShieldQuestion strokeWidth={1.75} className="text-warn" />;
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
    case "awaiting-approval":
      return "等待确认";
    case "executing":
      return "执行中…";
    case "retrying":
      return execution.retryCount ? `重试中（${execution.retryCount}/2）` : "重试中";
    case "cancelled":
      return execution.metadata?.denied ? "已拒绝" : "已取消";
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
