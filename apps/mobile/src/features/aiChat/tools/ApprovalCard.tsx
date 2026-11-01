// 确认卡：写入与执行类工具等待用户确认时，在它执行顺序的位置出现。
// 字段与结果卡同一口径（用户确认的就是将会出现的那条待办）；「本次对话不再询问」降为一行文字。

import { useState } from "react";
import { CircleAlert, ShieldAlert, Trash2 } from "lucide-react";
import type { ToolCallExecutionState } from "@tau/shared/chat-renderers";
import {
  getToolInteractionHost,
  useToolInteraction,
  type ToolApprovalChoice,
} from "@tau/chat-ui/conversation";
import { cn } from "@tau/ui";
import { toast } from "../../../components/toast";
import { useApprovalPreview } from "./approvalPreview";
import { parseObject } from "./format";
import { FieldList } from "./parts";
import { presentTool } from "./presenters";
import { TimelineRow, ToolTitle } from "./ToolRow";

export function ApprovalCard(props: { execution: ToolCallExecutionState; linked?: boolean }) {
  const { execution } = props;
  const pending = useToolInteraction(execution, (host, item) => host.approvalOf(item), undefined);
  const ready = useToolInteraction(execution, (host, item) => host.isReady(item), false);
  const [submitting, setSubmitting] = useState(false);
  const host = getToolInteractionHost();
  const toolName = pending?.toolName ?? execution.toolName;
  const input = parseObject(pending?.input ?? execution.input) ?? {};
  const preview = useApprovalPreview(toolName, input);
  const presentation = presentTool(execution);

  if (!pending || !ready) {
    return (
      <TimelineRow
        linked={props.linked}
        tone="dim"
        icon={<ShieldAlert strokeWidth={1.9} />}
        title={<ToolTitle label={presentation.label} subject={presentation.subject} />}
        meta={pending ? "正在恢复确认…" : "已中断"}
        note={pending ? undefined : "等待确认时对话已中断，这次调用没有执行"}
      />
    );
  }

  const danger = !!presentation.write?.danger;
  const decide = async (choice: ToolApprovalChoice) => {
    if (!host || submitting) return;
    setSubmitting(true);
    try {
      await host.decideApproval(execution, pending, choice);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提交确认失败");
    } finally {
      setSubmitting(false);
    }
  };
  const Icon = danger ? Trash2 : ShieldAlert;
  const title = presentation.write?.confirm(input) ?? `允许「${presentation.label}」？`;
  const subtitle = danger
    ? "删除后无法恢复"
    : `AI 想${host?.riskLabel(pending.risk) ?? "执行操作"}，确认后才会执行`;

  return (
    <div
      className={cn(
        "bg-surface my-1.5 rounded-[20px] p-3.5",
        danger
          ? "shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--tau-danger)_45%,transparent)]"
          : "shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--tau-warn)_45%,transparent)]"
      )}
    >
      <div className="text-tau-body text-ink-1 flex items-center gap-2 font-semibold">
        <Icon
          size={20}
          aria-hidden
          className={cn("shrink-0", danger ? "text-danger" : "text-warn")}
        />
        {title}
      </div>
      <div className="text-tau-sm text-ink-3 mt-0.5 mb-2.5 ml-7">{subtitle}</div>
      {preview === null ? (
        <div className="text-tau-meta text-ink-3 mb-3 px-1">正在读取…</div>
      ) : (
        preview.fields.length > 0 && (
          <div className="mb-3">
            <FieldList
              fields={preview.fields.map(field => ({
                label: field.label,
                value: field.before ? (
                  <>
                    <span className="text-ink-3 mr-1.5 line-through">{field.before}</span>
                    {field.value}
                  </>
                ) : (
                  field.value
                ),
              }))}
            />
          </div>
        )
      )}
      {preview?.warning && (
        <div className="bg-danger-soft text-danger text-tau-meta mb-3 flex items-start gap-1.5 rounded-[10px] px-2.5 py-2 leading-[1.5]">
          <CircleAlert size={15} aria-hidden className="mt-[2px] shrink-0" />
          {preview.warning}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={() => void decide("deny")}
          className="text-tau-body text-ink-1 h-[46px] flex-1 rounded-[14px] font-semibold shadow-[inset_0_0_0_1px_var(--tau-line-2)] active:opacity-70 disabled:opacity-50"
        >
          拒绝
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void decide("allow")}
          className={cn(
            "text-tau-body text-ink-inverse h-[46px] flex-1 rounded-[14px] font-semibold active:opacity-80 disabled:opacity-50",
            danger ? "bg-danger" : "bg-accent"
          )}
        >
          {danger ? "删除" : "允许"}
        </button>
      </div>
      <button
        type="button"
        disabled={submitting}
        onClick={() => void decide("allow-session")}
        className="text-tau-sm text-ink-2 mt-1 flex h-9 w-full items-center justify-center disabled:opacity-50"
      >
        本次对话不再询问
        <span className={cn("ml-1 font-semibold", danger ? "text-danger" : "text-accent-text")}>
          {presentation.label}
        </span>
      </button>
    </div>
  );
}
