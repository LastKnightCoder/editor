/**
 * 工具确认条（D-060 通用工具权限模式）：工具进入 awaiting-approval 时，在对话里的工具行下方原地展开。
 * 一行说明 + 命令 / 参数摘要 + 「允许 / 本会话始终允许 / 拒绝」；拒绝结果回给模型。
 * 应用重启后遗留的等待态没有活的等待项，只显示「已中断」。
 */

import { memo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import type { ToolCallExecutionState } from "@tau/shared";
import { Button, toast } from "@tau/ui";
import { decideToolApproval, usePiInteractionStore } from "@/services/piInteractions";
import { RISK_LABEL } from "@/services/tool-permission/mode";
import type { PiToolApprovalChoice } from "@/types/pi-session";

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
  const sessionId = execution.metadata?.piSessionId;
  const pending = usePiInteractionStore(s =>
    typeof sessionId === "string"
      ? s.sessions[sessionId]?.approvals.find(item => item.toolCallId === execution.toolCallId)
      : undefined
  );
  const [submitting, setSubmitting] = useState(false);
  const ready = usePiInteractionStore(
    s => typeof sessionId === "string" && s.readySessions[sessionId] === true
  );
  const live = Boolean(pending) && ready;
  const risk = pending?.risk ?? "execute";
  const decide = async (choice: PiToolApprovalChoice) => {
    if (!pending || !ready || submitting) return;
    setSubmitting(true);
    try {
      await decideToolApproval(pending, choice);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提交工具审批失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-warn-soft rounded-tau-md mb-1 ml-5 mt-1 px-3 py-2.5">
      <div className="text-tau-meta text-ink-1 flex items-center gap-2">
        <ShieldAlert className="text-warn size-4 shrink-0" strokeWidth={1.75} />
        <span className="min-w-0 flex-1">
          {live ? (
            <>
              AI 想要<b className="font-semibold">{RISK_LABEL[risk]}</b>，需要你确认
            </>
          ) : pending ? (
            "正在恢复工具审批…"
          ) : (
            "等待确认时对话已中断，这次调用没有执行"
          )}
        </span>
      </div>
      <pre className="font-tau-mono text-ink-1 bg-surface rounded-tau-sm m-0 mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all px-2.5 py-1.5 text-[12px] leading-[1.6]">
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
          <span className="text-tau-sm text-ink-3 ml-auto">
            可在设置「AI 服务 · 工具权限」里改为自动
          </span>
        </div>
      )}
    </div>
  );
});
