import { Check, FilePlus2, Pencil, Rocket, Send, X, type LucideIcon } from "lucide-react";
import { Panel, cn } from "@tau/ui";
import type { ReviewDetails, Submission } from "../../../../contracts";
import { formatRelative } from "../../components/format";

type Tone = "plain" | "info" | "warn" | "ok" | "danger";
interface Step {
  key: string;
  icon: LucideIcon;
  tone: Tone;
  title: string;
  meta: string;
  time: string;
}

const TONES: Record<Tone, string> = {
  plain: "bg-hover text-ink-3",
  info: "bg-info-soft text-info",
  warn: "bg-warn-soft text-warn",
  ok: "bg-ok-soft text-ok",
  danger: "bg-danger-soft text-danger",
};

const DECISIONS = {
  approve: { icon: Check, tone: "ok", title: "批准" },
  request_changes: { icon: Pencil, tone: "warn", title: "要求修改" },
  reject: { icon: X, tone: "danger", title: "拒绝" },
} as const;

const RELEASE = {
  pending: "排队发布",
  publishing: "正在发布",
  published: "已上架插件中心",
  failed: "发布失败，等待管理员重试",
} as const;

/** 由提交时间戳与审核记录拼出的进度；只记录服务端确有的事件 */
export function ProgressTimeline({
  submission,
  details,
}: {
  submission: Submission;
  details: ReviewDetails | undefined;
}) {
  const steps: Step[] = [
    {
      key: "created",
      icon: FilePlus2,
      tone: "plain",
      title: "创建草稿",
      meta: formatRelative(submission.createdAt),
      time: submission.createdAt,
    },
  ];
  for (const review of details?.reviews ?? []) {
    const decision = DECISIONS[review.decision];
    steps.push({
      key: review.id,
      icon: decision.icon,
      tone: decision.tone,
      title: `${decision.title} v${review.manifest.version}`,
      meta: `${formatRelative(review.createdAt)} · @${review.reviewer.login}`,
      time: review.createdAt,
    });
  }
  // submittedAt 只保留最近一次提交时间，早先的提交由审核记录体现
  if (submission.submittedAt && submission.status === "pending_review")
    steps.push({
      key: "submitted",
      icon: Send,
      tone: "info",
      title: `提交 v${submission.content?.manifest.version ?? ""} 审核`,
      meta: formatRelative(submission.submittedAt),
      time: submission.submittedAt,
    });
  const release = details?.release;
  if (release)
    steps.push({
      key: "release",
      icon: Rocket,
      tone: release.state === "published" ? "ok" : release.state === "failed" ? "danger" : "info",
      title: RELEASE[release.state],
      meta: release.publishedAt ? formatRelative(release.publishedAt) : `v${release.version}`,
      time: release.publishedAt ?? "9999",
    });
  steps.sort((a, b) => a.time.localeCompare(b.time));
  return (
    <Panel pad="compact">
      <h2 className="text-tau-sm text-ink-3 mb-2 font-medium">进度</h2>
      <ol className="flex flex-col">
        {steps.map((step, index) => (
          <li key={step.key} className="relative flex gap-2.5 pb-3.5 last:pb-0">
            {index < steps.length - 1 && (
              <span className="bg-line-1 absolute bottom-0 left-[9px] top-5 w-px" aria-hidden />
            )}
            <span
              className={cn(
                "grid size-[19px] shrink-0 place-items-center rounded-full",
                TONES[step.tone]
              )}
            >
              <step.icon size={11} strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <p className="text-tau-meta text-ink-1">{step.title}</p>
              <p className="text-tau-micro text-ink-3">{step.meta}</p>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
