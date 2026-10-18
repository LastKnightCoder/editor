import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Textarea, ConfirmDialog } from "@tau/ui";
import type { ReviewDecision, Submission, Release } from "../../../../contracts";
import { queryKeys, useApi } from "../../app/api";
import { useSession } from "../../app/session";
import { Section } from "./Section";
import { savePluginZip } from "../../api/download";

const labels: Record<ReviewDecision, string> = {
  approve: "批准并发布",
  request_changes: "要求修改",
  reject: "拒绝",
};
export function ReviewPanel({ submission }: { submission: Submission }) {
  const api = useApi(),
    client = useQueryClient(),
    session = useSession();
  const [comment, setComment] = useState("");
  const downloadRelease = useMutation({
    mutationFn: (release: Release) =>
      savePluginZip(api, release.id, `${release.pluginId}-${release.version}.zip`),
  });
  const [confirm, setConfirm] = useState<{
    decision: ReviewDecision;
    revision: number;
    comment: string;
  } | null>(null);
  const key = ["reviews", submission.id];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api.getReviews(submission.id),
    refetchOnWindowFocus: true,
    refetchInterval: q =>
      ["pending", "publishing"].includes(q.state.data?.release?.state ?? "") ? 3000 : false,
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: key });
    void client.invalidateQueries({ queryKey: queryKeys.submission(submission.id) });
    void client.invalidateQueries({ queryKey: queryKeys.submissions });
  };
  const decide = useMutation({
    mutationFn: (input: NonNullable<typeof confirm>) => api.reviewSubmission(submission.id, input),
    onSuccess: () => {
      setComment("");
      setConfirm(null);
      refresh();
    },
    onError: () => {
      setConfirm(null);
      refresh();
    },
  });
  const retry = useMutation({
    mutationFn: () => api.retryPublish(submission.id),
    onSuccess: refresh,
    onError: refresh,
  });
  const release = query.data?.release;
  const download = api.packageDownloadUrl(submission.id);
  return (
    <Section title="审核与发布">
      {download && (
        <a href={download} className="text-accent-text text-tau-sm">
          下载本次提交的 ZIP
        </a>
      )}
      {query.isError && (
        <p role="alert">
          {query.error.message}
          <Button onClick={() => void query.refetch()}>重试</Button>
        </p>
      )}
      {query.data?.reviews.map(item => (
        <article key={item.id} className="border-line-1 border-b py-3">
          <p className="text-ink-1 text-tau-sm">
            {labels[item.decision]} · {item.reviewer.login} ·{" "}
            {new Date(item.createdAt).toLocaleString()}
          </p>
          <p className="text-ink-2 text-tau-sm whitespace-pre-wrap">{item.comment || "审核通过"}</p>
          <p className="text-ink-3 text-tau-micro break-all">
            v{item.manifest.version} · 修订 {item.revision} · SHA-256 {item.sha256}
          </p>
        </article>
      ))}
      {session.data?.reviewer && submission.status === "pending_review" && (
        <>
          <Textarea
            aria-label="审核意见"
            value={comment}
            maxLength={4000}
            disabled={decide.isPending}
            onChange={e => setComment(e.target.value)}
            placeholder="要求修改或拒绝时请说明原因"
          />
          <div className="flex flex-wrap gap-3">
            {(Object.keys(labels) as ReviewDecision[]).map(decision => (
              <Button
                key={decision}
                variant={decision === "approve" ? "primary" : "secondary"}
                disabled={decide.isPending || (decision !== "approve" && !comment.trim())}
                onClick={() => setConfirm({ decision, revision: submission.revision, comment })}
              >
                {labels[decision]}
              </Button>
            ))}
          </div>
        </>
      )}
      {decide.isError && (
        <p role="alert" className="text-danger text-tau-sm">
          {decide.error.message}
        </p>
      )}
      {release && (
        <div className="text-tau-sm">
          <p>
            {release.state === "published"
              ? "已发布，可下载"
              : release.state === "failed"
                ? "审核已批准，发布失败"
                : "审核已批准，正在发布"}
          </p>
          {release.error && (
            <p role="alert" className="text-danger">
              {release.error}
            </p>
          )}
          {release.downloadUrl && (
            <Button
              variant="ghost"
              loading={downloadRelease.isPending}
              onClick={() => downloadRelease.mutate(release)}
            >
              下载已发布版本 v{release.version}
            </Button>
          )}
          {session.data?.reviewer && release.state !== "published" && (
            <Button loading={retry.isPending} onClick={() => retry.mutate()}>
              重试发布
            </Button>
          )}
          {retry.isError && <p role="alert">{retry.error.message}</p>}
          {downloadRelease.isError && <p role="alert">{downloadRelease.error.message}</p>}
        </div>
      )}
      <ConfirmDialog
        open={!!confirm}
        title={confirm ? labels[confirm.decision] : "确认审核"}
        context={`v${submission.content?.manifest.version ?? ""} · 修订 ${confirm?.revision ?? submission.revision}`}
        onOpenChange={open => {
          if (!open) setConfirm(null);
        }}
        onConfirm={async () => {
          if (confirm) await decide.mutateAsync(confirm);
        }}
        confirmDisabled={confirm?.revision !== submission.revision}
        confirmText="确认"
        description={
          confirm?.decision === "approve"
            ? "确认批准当前修订的ZIP并公开发布？批准后该版本不能覆盖。"
            : confirm?.decision === "request_changes"
              ? "将退回作者修改，旧审核记录保留，重提后需要再次审核。"
              : "将终止本次提交，原因会显示给作者。"
        }
      />
    </Section>
  );
}
