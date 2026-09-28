import { useState } from "react";
import classNames from "classnames";
import type { AiRunApprovalRequest } from "@tau/shared";

interface ToolApprovalBarProps {
  approvals: AiRunApprovalRequest[];
  isDark?: boolean;
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
export default function ToolApprovalBar({ approvals, isDark, onDecide }: ToolApprovalBarProps) {
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
        <div
          key={request.requestId}
          className={classNames(
            "rounded-xl border px-3 py-2 text-xs",
            isDark
              ? "border-amber-400/30 bg-amber-400/10 text-slate-200"
              : "border-amber-300 bg-amber-50 text-slate-700"
          )}
        >
          <div className="font-medium">
            模型想要{RISK_LABEL[request.risk] ?? "调用"}：{request.toolName}
          </div>
          <div
            className={classNames(
              "mt-1 break-all font-mono",
              isDark ? "text-slate-400" : "text-slate-500"
            )}
          >
            {previewInput(request.input)}
          </div>
          <div className="mt-2 flex gap-2">
            {(
              [
                ["allow", "允许"],
                ["allow-session", "本会话始终允许"],
                ["deny", "拒绝"],
              ] as const
            ).map(([choice, label]) => (
              <button
                key={choice}
                type="button"
                disabled={pending === request.requestId}
                onClick={() => decide(request.requestId, choice)}
                className={classNames(
                  "rounded-md px-2 py-1 disabled:opacity-50",
                  choice === "deny"
                    ? isDark
                      ? "bg-white/10 hover:bg-white/15"
                      : "bg-white hover:bg-slate-100"
                    : "bg-sky-600 text-white hover:bg-sky-500"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
      {error && (
        <div role="alert" className="text-xs text-red-500">
          {error}
        </div>
      )}
    </div>
  );
}
