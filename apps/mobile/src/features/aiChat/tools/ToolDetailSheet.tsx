import type { ToolDisplayContext, ToolMessageKey } from "../tools.messages";
import { useToolsI18n } from "../tools.i18n";
// 工具详情底部面板：点时间线行升起，头部写清这次调用做了什么，中间是专门展示，底部是折叠的原始数据。

import { useRef } from "react";
import { CircleAlert, X } from "lucide-react";
import type { ToolCallExecutionState } from "@tau/shared/chat-renderers";
import { cn } from "@tau/ui";
import { BottomSheet } from "../../../components/BottomSheet";
import { DetailBody } from "./detailBodies";
import { parseObject, softFailure } from "./format";
import { RawData } from "./parts";
import { hasDetailBody } from "./results";
import { presentTool } from "./presenters";

const SOURCE_NOTE_KEYS: Partial<Record<string, ToolMessageKey>> = {
  sql_query: "detail.sqlNote",
  search_knowledge: "detail.searchNote",
};

function failureOf(
  execution: ToolCallExecutionState,
  output: Record<string, unknown> | null,
  t: ToolDisplayContext["t"]
) {
  if (execution.status === "failed") return execution.error || t("failure.call");
  if (execution.status === "cancelled")
    return execution.metadata?.denied ? t("failure.denied") : t("failure.cancelled");
  return softFailure(output, t);
}

function DetailContent(props: { execution: ToolCallExecutionState; close(): void }) {
  const context = useToolsI18n();
  const { t } = context;
  const { execution } = props;
  const presentation = presentTool(execution, context);
  const input = parseObject(execution.input) ?? {};
  const output = parseObject(execution.output);
  const failure = failureOf(execution, output, t);
  const body = !failure && output && hasDetailBody(execution.toolName, output);
  const noteKey = SOURCE_NOTE_KEYS[execution.toolName];
  const subtitle = [
    presentation.subject && `「${presentation.subject}」`,
    noteKey ? t(noteKey) : undefined,
    presentation.meta,
  ]
    .filter(Boolean)
    .join(" · ");
  const Icon = presentation.icon;
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <Icon
          size={22}
          strokeWidth={1.9}
          aria-hidden
          className={cn("shrink-0", presentation.tone ?? "text-ink-2")}
        />
        <div className="min-w-0 flex-1">
          <div className="text-tau-title text-ink-1 truncate font-semibold">
            {presentation.label}
          </div>
          {subtitle && <div className="text-tau-sm text-ink-3 mt-px truncate">{subtitle}</div>}
        </div>
        <button
          type="button"
          aria-label={t("action.close")}
          onClick={props.close}
          className="bg-surface-hover text-ink-2 grid size-[34px] shrink-0 place-items-center rounded-full"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      {failure && (
        <div className="bg-danger-soft text-danger text-tau-meta flex items-start gap-2 rounded-[12px] px-3 py-2.5 leading-[1.55]">
          <CircleAlert size={16} aria-hidden className="mt-[2px] shrink-0" />
          <span className="min-w-0 break-words">{failure}</span>
        </div>
      )}
      {body && (
        <DetailBody execution={execution} input={input} output={output} close={props.close} />
      )}
      <RawData execution={execution} defaultOpen={!body && !failure} />
    </div>
  );
}

export function ToolDetailSheet(props: {
  execution: ToolCallExecutionState | null;
  onClose(): void;
}) {
  // 退场动画期间父级已置空，保留最后一次的内容
  const last = useRef(props.execution);
  if (props.execution) last.current = props.execution;
  const shown = props.execution ?? last.current;
  return (
    <BottomSheet open={!!props.execution} onClose={props.onClose}>
      {shown && <DetailContent execution={shown} close={props.onClose} />}
    </BottomSheet>
  );
}
