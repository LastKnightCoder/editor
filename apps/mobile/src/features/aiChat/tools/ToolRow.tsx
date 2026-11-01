// 时间线行：每次工具调用一行，左侧淡墨类别图标（无底色），标题「动作 + 对象」，右侧结果；整行可点开详情。
// 连续的行之间画一小段竖线，卡片（结果卡、确认卡、提问卡）打断它。

import { memo, useEffect, useState, type ReactNode } from "react";
import {
  Brain,
  ChevronRight,
  RotateCw,
  ShieldAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { ToolCallExecutionState } from "@tau/shared/chat-renderers";
import { formatElapsed } from "@tau/chat-ui/conversation";
import { Spinner, cn } from "@tau/ui";
import { parseObject, softFailure } from "./format";
import { presentTool } from "./presenters";

type RowTone = "default" | "dim" | "danger" | "warn";

/** 行的外观骨架：思考行与工具行共用 */
export function TimelineRow(props: {
  icon: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  tone?: RowTone;
  /** 前一项也是行时画连接线 */
  linked?: boolean;
  /** 行下方的一句说明（失败原因等） */
  note?: ReactNode;
  expanded?: boolean;
  onPress?: () => void;
  label?: string;
}) {
  const tone = props.tone ?? "default";
  const body = (
    <>
      {props.linked && (
        <span
          aria-hidden
          className="bg-line-2 absolute top-[-9px] left-[12.25px] h-2.5 w-[1.5px]"
        />
      )}
      <span
        className={cn(
          "grid size-[26px] shrink-0 place-items-center [&_svg]:size-3.5",
          tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-ink-3"
        )}
      >
        {props.icon}
      </span>
      <span
        className={cn(
          "text-tau-meta min-w-0 flex-1 truncate",
          tone === "dim" ? "text-ink-3" : "text-ink-2"
        )}
      >
        {props.title}
      </span>
      {props.meta != null && (
        <span
          className={cn(
            "text-tau-sm shrink-0 tabular-nums",
            tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-ink-3"
          )}
        >
          {props.meta}
        </span>
      )}
      {props.onPress && (
        <ChevronRight
          size={15}
          aria-hidden
          className={cn(
            "text-ink-3 -ml-1 shrink-0 transition-transform",
            props.expanded && "rotate-90"
          )}
        />
      )}
    </>
  );
  const rowClass = "relative flex min-h-10 w-full items-center gap-2.5 text-left";
  return (
    <div className="min-w-0">
      {props.onPress ? (
        <button
          type="button"
          aria-label={props.label}
          aria-expanded={props.expanded}
          onClick={props.onPress}
          className={cn(
            rowClass,
            "active:bg-surface-hover -mx-1.5 w-[calc(100%+12px)] rounded-xl px-1.5"
          )}
        >
          {body}
        </button>
      ) : (
        <div className={rowClass}>{body}</div>
      )}
      {props.note && (
        <div
          className={cn(
            "text-tau-sm -mt-1.5 mb-1 ml-9 line-clamp-2 leading-[1.55]",
            tone === "danger" ? "text-danger" : "text-ink-3"
          )}
        >
          {props.note}
        </div>
      )}
    </div>
  );
}

/** 标题里的对象用「」括起，墨色深一档 */
export function ToolTitle(props: { label: string; subject?: string; running?: boolean }) {
  return (
    <>
      {props.running ? `正在${props.label}` : props.label}
      {props.subject && <span className="text-ink-1"> 「{props.subject}」</span>}
    </>
  );
}

function rowState(execution: ToolCallExecutionState, meta: string | undefined) {
  const icon = (Icon: LucideIcon) => <Icon strokeWidth={1.9} />;
  switch (execution.status) {
    case "pending":
    case "executing":
      return {
        tone: "default" as const,
        running: true,
        icon: <Spinner className="size-3.5 border-[1.5px]" />,
      };
    case "awaiting-approval":
      return { tone: "warn" as const, meta: "等待确认", icon: icon(ShieldAlert) };
    case "retrying":
      return {
        tone: "warn" as const,
        meta: execution.retryCount ? `重试 ${execution.retryCount}/2` : "重试中",
        icon: <RotateCw strokeWidth={1.9} className="animate-spin" />,
      };
    case "cancelled":
      return { tone: "dim" as const, meta: execution.metadata?.denied ? "你拒绝了" : "已取消" };
    case "failed": {
      const unknown = /AI_TOOL_OUTCOME_UNKNOWN|结果未知/.test(execution.error ?? "");
      return {
        tone: "danger" as const,
        meta: unknown ? "已中断" : execution.errorType === "parameter" ? "参数有误" : "失败",
        note: execution.error,
        icon: icon(TriangleAlert),
      };
    }
    case "success": {
      const failure = softFailure(parseObject(execution.output));
      return failure
        ? { tone: "danger" as const, meta: "没有成功", note: failure, icon: icon(TriangleAlert) }
        : { tone: "default" as const, meta };
    }
  }
}

export const ToolRow = memo(function ToolRow(props: {
  execution: ToolCallExecutionState;
  linked?: boolean;
  onOpen?: () => void;
}) {
  const presentation = presentTool(props.execution);
  const state = rowState(props.execution, presentation.meta);
  const Icon = presentation.icon;
  return (
    <TimelineRow
      linked={props.linked}
      tone={state.tone}
      icon={
        state.icon ?? (
          <Icon
            strokeWidth={1.9}
            className={state.tone === "dim" ? undefined : presentation.tone}
          />
        )
      }
      title={
        <ToolTitle
          label={presentation.label}
          subject={presentation.subject}
          running={"running" in state && state.running}
        />
      }
      meta={state.meta}
      note={"note" in state ? state.note : undefined}
      onPress={props.onOpen}
      label={`${presentation.label}${presentation.subject ? `「${presentation.subject}」` : ""}`}
    />
  );
});

/** 思考行：与工具行同一样式，点开在行下展开思考内容 */
export function ReasoningRow(props: {
  startTime?: number;
  endTime?: number;
  duration?: number;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const thinking = props.startTime !== undefined && props.endTime === undefined;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!thinking) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [thinking]);
  const elapsed =
    props.duration ??
    (props.startTime !== undefined ? (props.endTime ?? now) - props.startTime : undefined);
  const title = thinking
    ? `思考中${elapsed !== undefined ? ` ${formatElapsed(elapsed)}` : "…"}`
    : elapsed !== undefined
      ? `思考了 ${formatElapsed(elapsed)}`
      : "思考过程";
  return (
    <div className="my-1 first:mt-0">
      <TimelineRow
        tone="dim"
        icon={
          thinking ? <Spinner className="size-3.5 border-[1.5px]" /> : <Brain strokeWidth={1.9} />
        }
        title={<span className="tabular-nums">{title}</span>}
        expanded={expanded}
        onPress={() => setExpanded(value => !value)}
        label={title}
      />
      {expanded && (
        <div className="border-line-1 text-ink-2 mb-2 ml-3 border-l-[1.5px] pl-5">
          {props.children}
        </div>
      )}
    </div>
  );
}
