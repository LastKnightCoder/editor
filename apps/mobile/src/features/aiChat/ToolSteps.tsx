// 过程胶囊：一组相邻的普通工具调用收成一枚「查询日程、查询待办 · 2 步」，点开逐条看输入输出。
// 等待确认、失败重试与有自定义渲染器的工具（提问卡等）需要用户看见或操作，仍单独渲染在胶囊之后。

import { memo, useState, type ReactNode } from "react";
import { Ban, Check, ChevronRight } from "lucide-react";
import type { ToolCallExecutionState } from "@tau/shared/chat-renderers";
import { toolCallRendererRegistry } from "@tau/chat-ui/renderers";
import { ToolCallRow } from "@tau/chat-ui/conversation";
import { Spinner, cn } from "@tau/ui";
import { TOOL_LABELS } from "./interactions";

const MAX_NAMED = 2;

const labelOf = (execution: ToolCallExecutionState) =>
  TOOL_LABELS[execution.toolName] ?? execution.toolName;

function rendererKeyOf(execution: ToolCallExecutionState) {
  const render = (execution.metadata as { render?: { rendererKey?: unknown } } | undefined)?.render;
  return typeof render?.rendererKey === "string" ? render.rendererKey : "";
}

/** 需要单独露出的调用：用户要操作（确认、作答）或要看见的问题（失败、重试） */
function isStandalone(execution: ToolCallExecutionState) {
  return (
    execution.status === "awaiting-approval" ||
    execution.status === "failed" ||
    execution.status === "retrying" ||
    !!toolCallRendererRegistry.resolve(execution.toolName, rendererKeyOf(execution))
  );
}

function summary(executions: ToolCallExecutionState[]) {
  const running = executions.find(item => item.status === "executing" || item.status === "pending");
  if (running)
    return { icon: <Spinner className="size-3 border-[1.5px]" />, text: `正在${labelOf(running)}` };
  const names = [...new Set(executions.map(labelOf))];
  const named = names.slice(0, MAX_NAMED).join("、") + (names.length > MAX_NAMED ? " 等" : "");
  const cancelled = executions.every(item => item.status === "cancelled");
  return {
    icon: cancelled ? (
      <Ban className="text-ink-3" />
    ) : (
      <Check strokeWidth={2.2} className="text-ok" />
    ),
    text: named,
  };
}

export const ToolSteps = memo(function ToolSteps(props: {
  executions: ToolCallExecutionState[];
  renderStandalone(execution: ToolCallExecutionState): ReactNode;
  toolTitle(execution: ToolCallExecutionState): ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const plain = props.executions.filter(item => !isStandalone(item));
  const standalone = props.executions.filter(isStandalone);
  const head = plain.length ? summary(plain) : null;
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      {head && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(value => !value)}
          className="bg-surface text-ink-2 text-tau-sm flex h-7 max-w-full items-center gap-1.5 rounded-full pr-2 pl-2.5 transition-transform active:scale-[0.97]"
        >
          <span className="grid size-3.5 shrink-0 place-items-center [&_svg]:size-3.5">
            {head.icon}
          </span>
          <span className="min-w-0 truncate">{head.text}</span>
          {plain.length > 1 && <span className="text-ink-3 shrink-0">· {plain.length} 步</span>}
          <ChevronRight
            size={13}
            aria-hidden="true"
            className={cn("text-ink-3 shrink-0 transition-transform", expanded && "rotate-90")}
          />
        </button>
      )}
      {head && expanded && (
        <div className="border-line-2 ml-2.5 flex w-[calc(100%-10px)] min-w-0 flex-col border-l-[1.5px] pl-2">
          {plain.map(execution => (
            <ToolCallRow
              key={execution.toolCallId}
              execution={execution}
              title={props.toolTitle(execution)}
            />
          ))}
        </div>
      )}
      {standalone.map(execution => (
        <div key={execution.toolCallId} className="w-full min-w-0">
          {props.renderStandalone(execution)}
        </div>
      ))}
    </div>
  );
});
