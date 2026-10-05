import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import type { AiRunApprovalRequest } from "@tau/shared";
import { Button } from "@tau/ui";

interface ToolApprovalBarProps {
  approvals: AiRunApprovalRequest[];
  onDecide: (requestId: string, choice: "allow" | "allow-session" | "deny") => Promise<void>;
}

const RISK_LABEL: Record<string, string> = {
  read: "读取",
  write: "修改",
  execute: "执行",
};

/** 输入参数预览：最多两行，避免把长 JSON 铺满侧栏 */
const previewInput = (input: string) => {
  try {
    const parsed = JSON.parse(input) as unknown;
    const text = JSON.stringify(parsed);
    return text.length > 160 ? `${text.slice(0, 160)}…` : text;
  } catch {
    return input.length > 160 ? `${input.slice(0, 160)}…` : input;
  }
};

/**
 * 工具审批条（M5：扩展对话的审批走桌面宿主原生）。桌面按「工具权限」设置判定哪些调用要确认，
 * 在等时这里逐条显示，允许 / 本会话始终允许 / 拒绝经 ai.run.approve 发回同一轮运行。
 */
export default function ToolApprovalBar({ approvals, onDecide }: ToolApprovalBarProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  if (approvals.length === 0) return null;

  const decide = (requestId: string, choice: "allow" | "allow-session" | "deny") => {
    setPending(requestId);
    setError("");
    onDecide(requestId, choice)
      .catch(decideError =>
        setError(decideError instanceof Error ? decideError.message : String(decideError))
      )
      .finally(() => setPending(null));
  };

  return (
    <div role="region" aria-label="等待确认的工具调用" className="mb-2 space-y-2">
      {approvals.map(request => (
        <div key={request.requestId} className="bg-warn-soft rounded-tau-md px-3 py-2.5">
          <div className="text-tau-meta text-ink-1 flex items-center gap-2">
            <ShieldAlert className="text-warn size-4 shrink-0" strokeWidth={1.75} />
            <span className="min-w-0 flex-1">
              AI 想要<b className="font-semibold">{RISK_LABEL[request.risk] ?? "调用"}</b>
              <span className="font-tau-mono"> {request.toolName}</span>，需要你确认
            </span>
          </div>
          <pre className="font-tau-mono text-ink-1 bg-surface rounded-tau-sm m-0 mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all px-2.5 py-1.5 text-[12px] leading-[1.6]">
            {previewInput(request.input)}
          </pre>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {(
              [
                ["allow", "允许", "primary"],
                ["allow-session", "本会话始终允许", "secondary"],
                ["deny", "拒绝", "ghost"],
              ] as const
            ).map(([choice, label, variant]) => (
              <Button
                key={choice}
                size="sm"
                variant={variant}
                disabled={pending === request.requestId}
                onClick={() => decide(request.requestId, choice)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      ))}
      {error && (
        <div role="alert" className="text-tau-sm text-danger">
          {error}
        </div>
      )}
    </div>
  );
}
