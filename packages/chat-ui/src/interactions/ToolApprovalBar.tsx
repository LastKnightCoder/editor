/**
 * 工具确认条：工具进入 awaiting-approval 时，在对话里的工具行下方原地展开。
 * 一行说明 + 命令 / 参数摘要 + 「允许 / 本会话始终允许 / 拒绝」；拒绝结果回给模型。
 * 宿主已没有这条等待（中止 / 应用重启）时只显示「已中断」。
 */

import { memo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import type { ToolCallExecutionState } from "@tau/shared/chat-renderers";
import { Button, toast } from "@tau/ui";
import { getToolInteractionHost, useToolInteraction, type ToolApprovalChoice } from "./host";

const parseInput = (input: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const quote = (arg: string) => (/^[\w./:=@%+-]+$/.test(arg) ? arg : JSON.stringify(arg));

/** 摘要：脚本类显示成一条命令，其余显示格式化后的参数 */
export function summarizeToolInput(toolName: string, input: string): string {
  const args = parseInput(input);
  if (toolName === "run_skill_script") {
    const scriptArgs = Array.isArray(args.args) ? args.args.map(v => quote(String(v))) : [];
    return [`${String(args.folderName ?? "?")}/${String(args.script ?? "?")}`, ...scriptArgs].join(
      " "
    );
  }
  const text = Object.keys(args).length ? JSON.stringify(args, null, 2) : input;
  return text.length > 600 ? `${text.slice(0, 600)}…` : text;
}

export const ToolApprovalBar = memo(function ToolApprovalBar({
  execution,
}: {
  execution: ToolCallExecutionState;
}) {
  const pending = useToolInteraction(execution, (host, item) => host.approvalOf(item), undefined);
  const ready = useToolInteraction(execution, (host, item) => host.isReady(item), false);
  const [submitting, setSubmitting] = useState(false);
  const host = getToolInteractionHost();
  const live = Boolean(pending) && ready;
  const risk = pending?.risk ?? "execute";
  const decide = async (choice: ToolApprovalChoice) => {
    if (!host || !pending || !ready || submitting) return;
    setSubmitting(true);
    try {
      await host.decideApproval(execution, pending, choice);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提交工具审批失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-warn-soft rounded-tau-md mt-1 mb-1 ml-5 px-3 py-2.5">
      <div className="text-tau-meta text-ink-1 flex items-center gap-2">
        <ShieldAlert className="text-warn size-4 shrink-0" strokeWidth={1.75} />
        <span className="min-w-0 flex-1">
          {live ? (
            <>
              AI 想要<b className="font-semibold">{host?.riskLabel(risk) ?? risk}</b>，需要你确认
            </>
          ) : pending ? (
            "正在恢复工具审批…"
          ) : (
            "等待确认时对话已中断，这次调用没有执行"
          )}
        </span>
      </div>
      <pre className="font-tau-mono text-ink-1 bg-surface rounded-tau-sm m-0 mt-2 max-h-40 overflow-auto px-2.5 py-1.5 text-[12px] leading-[1.6] break-all whitespace-pre-wrap">
        {summarizeToolInput(
          pending?.toolName ?? execution.toolName,
          pending?.input ?? execution.input
        )}
      </pre>
      {live && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="primary"
            disabled={submitting}
            onClick={() => void decide("allow")}
          >
            允许
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={submitting}
            onClick={() => void decide("allow-session")}
          >
            本会话始终允许
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={submitting}
            onClick={() => void decide("deny")}
          >
            拒绝
          </Button>
          {host?.approvalHint && (
            <span className="text-tau-sm text-ink-3 ml-auto">{host.approvalHint}</span>
          )}
        </div>
      )}
    </div>
  );
});
