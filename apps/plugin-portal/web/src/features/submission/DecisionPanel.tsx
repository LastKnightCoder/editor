import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, ConfirmDialog, Panel, Textarea, cn } from "@tau/ui";
import type { ReviewDecision, ReviewRequest, Submission } from "../../../../contracts";
import { useApi } from "../../app/api";
import { errorMessage } from "../../api/errors";
import { DECISION_LABELS } from "./decisions";
import { useRefreshSubmission } from "./queries";
import { requiresSystemReview } from "../../../../contracts/execution";

const OPTIONS: { value: ReviewDecision; hint: string }[] = [
  { value: "approve", hint: "当前修订的 ZIP 公开上架，该版本号之后不能覆盖" },
  { value: "request_changes", hint: "退回作者，旧记录保留；重提后需再次审核" },
  { value: "reject", hint: "结束这次提交，原因会显示给作者" },
];

const PRESETS = [
  "README 缺少配置或使用说明",
  "权限用途说明不清",
  "与已有插件功能重复",
  "运行时报错",
];

const CONFIRM_TEXT: Partial<Record<ReviewDecision, string>> = {
  approve: "确认批准当前修订的 ZIP 并公开发布？批准后该版本不能覆盖。",
  reject: "将结束本次提交，原因会显示给作者。作者可以另建提交。",
};

/** 审核决定：三选一，退回与拒绝必须写原因；批准与拒绝不可逆，需要二次确认 */
export function DecisionPanel({ submission }: { submission: Submission }) {
  const api = useApi();
  const refresh = useRefreshSubmission(submission.id);
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [comment, setComment] = useState("");
  const [confirm, setConfirm] = useState<ReviewRequest | null>(null);
  const [reviewedRevision, setReviewedRevision] = useState<number | null>(null);
  const systemReview = !!submission.content && requiresSystemReview(submission.content.manifest);
  const decide = useMutation({
    mutationFn: (input: ReviewRequest) => api.reviewSubmission(submission.id, input),
    onSuccess: () => {
      setComment("");
      setDecision(null);
      setConfirm(null);
      void refresh();
    },
    onError: () => {
      setConfirm(null);
      void refresh();
    },
  });
  const needsReason = decision !== null && decision !== "approve";
  const blocked =
    !decision ||
    (needsReason && !comment.trim()) ||
    decide.isPending ||
    (decision === "approve" && systemReview && reviewedRevision !== submission.revision);
  const commit = () => {
    if (!decision || blocked) return;
    const input = {
      decision,
      revision: submission.revision,
      comment: comment.trim(),
      ...(systemReview && decision === "approve" ? { systemReviewConfirmed: true } : {}),
    };
    if (CONFIRM_TEXT[decision]) setConfirm(input);
    else decide.mutate(input);
  };

  return (
    <Panel className="flex flex-col gap-3">
      <h2 className="text-tau-body text-ink-1 font-semibold">审核决定</h2>
      <div role="radiogroup" aria-label="审核决定" className="flex flex-col gap-1.5">
        {OPTIONS.map(option => {
          const checked = decision === option.value;
          const danger = option.value === "reject";
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => setDecision(option.value)}
              className={cn(
                "rounded-tau-sm flex gap-2.5 border px-3 py-2.5 text-left transition-colors",
                checked
                  ? danger
                    ? "border-danger bg-danger-soft"
                    : "border-accent bg-accent-soft"
                  : "border-line-1 bg-surface hover:bg-surface-hover"
              )}
            >
              <span
                className={cn(
                  "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-[1.5px]",
                  checked ? (danger ? "border-danger" : "border-accent") : "border-track"
                )}
              >
                {checked && (
                  <span className={cn("size-2 rounded-full", danger ? "bg-danger" : "bg-accent")} />
                )}
              </span>
              <span>
                <span className="text-tau-body text-ink-1 block font-medium">
                  {DECISION_LABELS[option.value]}
                </span>
                <span className="text-tau-micro text-ink-3">{option.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      {decision && (
        <div className="flex flex-col gap-2">
          <Textarea
            aria-label="审核意见"
            value={comment}
            maxLength={4000}
            disabled={decide.isPending}
            onChange={event => setComment(event.target.value)}
            placeholder={needsReason ? "说明原因（必填，作者会看到）" : "可选：给作者留一句话"}
          />
          {needsReason && (
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map(text => (
                <button
                  key={text}
                  type="button"
                  onClick={() =>
                    setComment(value => (value.trim() ? `${value.trim()}；${text}` : text))
                  }
                  className="bg-hover text-ink-2 hover:bg-press hover:text-ink-1 text-tau-micro rounded-full px-2.5 py-0.5 transition-colors"
                >
                  {text}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {systemReview && decision === "approve" && (
        <label className="text-tau-sm text-ink-2 flex items-start gap-2">
          <input
            type="checkbox"
            checked={reviewedRevision === submission.revision}
            onChange={event =>
              setReviewedRevision(event.target.checked ? submission.revision : null)
            }
          />
          我已检查本修订的后台代码、启动时机、常驻行为和外部程序声明，确认系统能力用途与源码一致。
        </label>
      )}
      <Button
        block
        variant={decision === "reject" ? "danger" : "primary"}
        disabled={blocked}
        loading={decide.isPending && !confirm}
        onClick={commit}
      >
        {decision ? DECISION_LABELS[decision] : "选择一个决定"}
      </Button>
      {decide.isError && (
        <p role="alert" className="text-tau-sm text-danger">
          {errorMessage(decide.error)}
        </p>
      )}
      <p className="text-tau-micro text-ink-3">
        只针对修订 {submission.revision}；作者在你审核期间更新，确认会失效。
      </p>
      <ConfirmDialog
        open={!!confirm}
        title={confirm ? DECISION_LABELS[confirm.decision] : "确认审核"}
        context={`v${submission.content?.manifest.version ?? ""} · 修订 ${confirm?.revision ?? submission.revision}`}
        danger={confirm?.decision === "reject"}
        onOpenChange={open => {
          if (!open) setConfirm(null);
        }}
        onConfirm={async () => {
          if (confirm) await decide.mutateAsync(confirm);
        }}
        confirmDisabled={confirm?.revision !== submission.revision}
        confirmText="确认"
        description={confirm ? CONFIRM_TEXT[confirm.decision] : undefined}
      />
    </Panel>
  );
}
