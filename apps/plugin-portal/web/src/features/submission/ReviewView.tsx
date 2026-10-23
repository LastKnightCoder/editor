import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleDashed,
  Download,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { Button, IconButton, Panel, Tooltip, cn } from "@tau/ui";
import type { Release, ReviewDetails, Submission } from "../../../../contracts";
import { useApi } from "../../app/api";
import { savePluginZip } from "../../api/download";
import { errorMessage } from "../../api/errors";
import { Notice } from "../../components/Notice";
import { PageHeader, StatusTag } from "../../components/PageHeader";
import { PluginMark } from "../../components/PluginMark";
import { formatRelative } from "../../components/format";
import { DecisionPanel } from "./DecisionPanel";
import { DECISION_LABELS } from "./decisions";
import { FeedbackThread } from "./FeedbackThread";
import { PackagePreview } from "./PackagePreview";
import { ProgressTimeline } from "./ProgressTimeline";
import { RevokeRelease } from "./RevokeRelease";
import { VersionDiff } from "./VersionDiff";
import { useRefreshSubmission, useReviewDetails } from "./queries";

export interface QueueNeighbors {
  position: number;
  total: number;
  prev: string | null;
  next: string | null;
}

const PUBLISH_STEPS = [
  { key: "copy", label: "复制 ZIP 到发布存储并复核摘要" },
  { key: "catalog", label: "写入插件中心目录" },
] as const;

function PublishProgress({ release }: { release: Release }) {
  const done = release.state === "published";
  const running = release.state === "pending" || release.state === "publishing";
  return (
    <ul className="text-tau-meta flex flex-col gap-2">
      <li className="text-ok flex items-center gap-2">
        <CircleCheck size={15} />
        批准修订
      </li>
      {PUBLISH_STEPS.map((step, index) => {
        const state = done ? "done" : running && index === 0 ? "run" : "wait";
        return (
          <li
            key={step.key}
            className={cn(
              "flex items-center gap-2",
              state === "done" && "text-ok",
              state === "run" && "text-accent-text",
              state === "wait" && "text-ink-3"
            )}
          >
            {state === "done" ? (
              <CircleCheck size={15} />
            ) : state === "run" ? (
              <LoaderCircle size={15} className="animate-spin" />
            ) : (
              <CircleDashed size={15} />
            )}
            {step.label}
          </li>
        );
      })}
    </ul>
  );
}

/** 已处理的提交：显示决定、发布进度，并引导处理下一条 */
function ResultPanel({
  submission,
  details,
  next,
}: {
  submission: Submission;
  details: ReviewDetails | undefined;
  next: string | null;
}) {
  const api = useApi();
  const navigate = useNavigate();
  const refresh = useRefreshSubmission(submission.id);
  const latest = details?.reviews[0];
  const release = details?.release;
  const retry = useMutation({
    mutationFn: () => api.retryPublish(submission.id),
    onSettled: () => void refresh(),
  });
  const download = useMutation({
    mutationFn: (value: Release) =>
      savePluginZip(api, value.id, `${value.pluginId}-${value.version}.zip`),
  });
  return (
    <Panel className="flex flex-col gap-3">
      <h2 className="text-tau-body text-ink-1 font-semibold">
        {latest ? DECISION_LABELS[latest.decision] : "已处理"}
        {latest && (
          <span className="text-tau-micro text-ink-3 ml-2 font-normal">
            @{latest.reviewer.login} · {formatRelative(latest.createdAt)}
          </span>
        )}
      </h2>
      {latest?.comment && (
        <p className="text-tau-meta text-ink-2 border-line-1 whitespace-pre-wrap border-l-[3px] pl-3">
          {latest.comment}
        </p>
      )}
      {submission.status === "changes_requested" && (
        <p className="text-tau-sm text-ink-3">等待作者修改后重新提交。</p>
      )}
      {release && !release.revokedAt && <PublishProgress release={release} />}
      {release?.error && (
        <p role="alert" className="text-tau-sm text-danger">
          {release.error}
        </p>
      )}
      {release && !release.revokedAt && release.state !== "published" && (
        <Button loading={retry.isPending} onClick={() => retry.mutate()}>
          重试发布
        </Button>
      )}
      {retry.isError && (
        <p role="alert" className="text-tau-sm text-danger">
          {errorMessage(retry.error)}
        </p>
      )}
      {release?.downloadUrl && (
        <Button
          variant="ghost"
          icon={Download}
          loading={download.isPending}
          onClick={() => download.mutate(release)}
        >
          下载已发布版本 v{release.version}
        </Button>
      )}
      {release && <RevokeRelease submissionId={submission.id} release={release} />}
      {next && (
        <Button
          variant="soft"
          block
          onClick={() => navigate(`/review/${encodeURIComponent(next)}`)}
        >
          处理下一条
          <ArrowRight size={15} />
        </Button>
      )}
    </Panel>
  );
}

export function ReviewView({
  submission,
  neighbors,
}: {
  submission: Submission;
  neighbors: QueueNeighbors | null;
}) {
  const api = useApi();
  const navigate = useNavigate();
  const details = useReviewDetails(submission.id);
  const manifest = submission.content?.manifest;
  const pending = submission.status === "pending_review";
  const latest = details.data?.reviews[0];
  const resubmitted = pending && latest?.decision === "request_changes";
  const packageUrl = api.packageDownloadUrl(submission.id);
  const go = (id: string | null) => {
    if (id) navigate(`/review/${encodeURIComponent(id)}`);
  };

  return (
    <>
      <div className="text-tau-meta mb-3 flex items-center gap-1.5">
        <Link
          to="/review"
          className="text-ink-3 hover:text-ink-1 inline-flex items-center gap-1 transition-colors"
        >
          <ShieldCheck size={14} />
          审核队列
        </Link>
        {neighbors && (
          <span className="ml-auto flex items-center gap-1">
            <span className="text-tau-sm text-ink-3 mr-1">
              {neighbors.position} / {neighbors.total}
            </span>
            <Tooltip content="上一条">
              <IconButton
                aria-label="上一条"
                disabled={!neighbors.prev}
                onClick={() => go(neighbors.prev)}
              >
                <ChevronUp size={16} />
              </IconButton>
            </Tooltip>
            <Tooltip content="下一条">
              <IconButton
                aria-label="下一条"
                disabled={!neighbors.next}
                onClick={() => go(neighbors.next)}
              >
                <ChevronDown size={16} />
              </IconButton>
            </Tooltip>
          </span>
        )}
      </div>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {manifest && <PluginMark pluginId={manifest.id} name={manifest.name} size="lg" />}
            {manifest?.name ?? "未上传插件包"}
            {manifest && (
              <span className="text-tau-body text-ink-3 font-tau-mono font-normal">
                v{manifest.version}
              </span>
            )}
          </span>
        }
        tag={<StatusTag status={submission.status} />}
        meta={
          <span className="font-tau-mono">
            {manifest?.id} · 修订 {submission.revision} · 提交于{" "}
            {formatRelative(submission.submittedAt)}
          </span>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          {submission.disabled && (
            <Notice
              tone="warn"
              title="该插件当前处于禁用状态"
              actions={
                <Link
                  to={`/moderation/plugins?q=${encodeURIComponent(submission.pluginId ?? "")}`}
                  className="text-tau-sm text-accent-text inline-flex items-center gap-1 font-medium"
                >
                  去插件管理
                  <ArrowRight size={14} />
                </Link>
              }
            >
              <p className="whitespace-pre-wrap">禁用原因：{submission.disabled.reason}</p>
              <p className="mt-1">批准后版本会正常发布，但要在插件管理中恢复后才会重新上架。</p>
            </Notice>
          )}
          {resubmitted && (
            <Notice tone="info" title={`上一轮 @${latest.reviewer.login} 要求修改`}>
              <p className="line-clamp-3 whitespace-pre-wrap">{latest.comment}</p>
              <p className="mt-1">作者的回复见下方「沟通」。</p>
            </Notice>
          )}
          {manifest && <VersionDiff submission={submission} manifest={manifest} />}
          {submission.content && <PackagePreview content={submission.content} />}
          <FeedbackThread submissionId={submission.id} placeholder="给作者留言…" />
        </div>
        <aside className="flex flex-col gap-3.5 lg:sticky lg:top-[84px]">
          {pending ? (
            <DecisionPanel submission={submission} />
          ) : (
            <ResultPanel
              submission={submission}
              details={details.data}
              next={neighbors?.next ?? null}
            />
          )}
          {packageUrl && (
            <Panel pad="compact" className="flex flex-col gap-1.5">
              <Button block icon={Download} onClick={() => window.location.assign(packageUrl)}>
                下载本次提交的 ZIP
              </Button>
              <p className="text-tau-micro text-ink-3 text-center">审核用下载，不计入公开下载量</p>
            </Panel>
          )}
          <ProgressTimeline submission={submission} details={details.data} />
        </aside>
      </div>
    </>
  );
}
