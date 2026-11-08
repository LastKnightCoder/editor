import {
  Ban,
  Check,
  CircleAlert,
  CirclePause,
  Clock,
  Loader,
  MessageCircleQuestion,
  ShieldQuestion,
  X,
} from "lucide-react";
import { Spinner, cn } from "@tau/ui";
import type { SubagentActivity, SubagentView } from "@/types/subagent";
import {
  STATUS_LABEL,
  avatarInitial,
  avatarTone,
  needsUser,
  type SubagentDisplayStatus,
} from "./model";

const TONE = {
  1: "bg-tag-1-soft text-tag-1",
  2: "bg-tag-2-soft text-tag-2",
  3: "bg-tag-3-soft text-tag-3",
  4: "bg-tag-4-soft text-tag-4",
  5: "bg-tag-5-soft text-tag-5",
} as const;

const DOT: Record<SubagentDisplayStatus, string> = {
  running: "bg-accent",
  queued: "bg-ink-3",
  question: "bg-warn",
  approval: "bg-warn",
  completed: "bg-ok",
  failed: "bg-danger",
  cancelled: "bg-track",
  interrupted: "bg-track",
  idle: "bg-track",
};

const SIZE = {
  xs: "size-[18px] rounded-[6px] text-[10px]",
  sm: "size-[22px] rounded-[7px] text-tau-micro",
  lg: "size-[30px] rounded-[9px] text-tau-title",
} as const;

/** 子 Agent 身份：tag 色 + 首字，右下角状态点 */
export function SubagentAvatar({
  view,
  status,
  size = "sm",
  ring,
}: {
  view: SubagentView;
  status?: SubagentDisplayStatus;
  size?: keyof typeof SIZE;
  /** 叠放头像组时的描边色类（与背景一致） */
  ring?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid shrink-0 place-items-center font-semibold",
        SIZE[size],
        TONE[avatarTone(view.agent.agentId)],
        ring && cn("box-content border-2", ring)
      )}
    >
      {avatarInitial(view.agent.title)}
      {status && (
        <span
          className={cn(
            "border-surface absolute -right-[3px] -bottom-[3px] size-2.5 rounded-full border-2",
            DOT[status],
            needsUser(status) && "animate-pulse"
          )}
        />
      )}
    </span>
  );
}

export function SubagentAvatarStack({
  views,
  ring = "border-surface",
  max = 5,
}: {
  views: SubagentView[];
  ring?: string;
  max?: number;
}) {
  return (
    <span className="flex [&>*+*]:-ml-[7px]">
      {views.slice(0, max).map(view => (
        <SubagentAvatar key={view.agent.agentId} view={view} size="xs" ring={ring} />
      ))}
    </span>
  );
}

const STATUS_TONE: Record<SubagentDisplayStatus, string> = {
  running: "text-accent-text",
  queued: "text-ink-3",
  question: "text-warn font-medium",
  approval: "text-warn font-medium",
  completed: "text-ok",
  failed: "text-danger",
  cancelled: "text-ink-3",
  interrupted: "text-warn",
  idle: "text-ink-3",
};

function StatusIcon({ status }: { status: SubagentDisplayStatus }) {
  switch (status) {
    case "running":
      return <Spinner className="size-3 border-[1.5px]" />;
    case "queued":
      return <Clock strokeWidth={1.75} />;
    case "question":
      return <MessageCircleQuestion strokeWidth={1.75} />;
    case "approval":
      return <ShieldQuestion strokeWidth={1.75} />;
    case "completed":
      return <Check strokeWidth={2} />;
    case "failed":
      return <X strokeWidth={2} />;
    case "cancelled":
      return <Ban strokeWidth={1.75} />;
    case "interrupted":
      return <CirclePause strokeWidth={1.75} />;
    case "idle":
      return null;
  }
}

export function SubagentStatus({ status }: { status: SubagentDisplayStatus }) {
  return (
    <span
      className={cn(
        "text-tau-sm inline-flex items-center gap-[5px] whitespace-nowrap [&_svg]:size-[13px]",
        STATUS_TONE[status]
      )}
    >
      <StatusIcon status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}

const describeActivity = (activity: SubagentActivity | undefined) => {
  if (!activity || activity.kind === "thinking") return "正在思考…";
  return activity.summary ? `${activity.toolName} · ${activity.summary}` : `${activity.toolName}`;
};

/** 活动行：子 Agent 此刻在做什么；执行中文字带流光 */
export function SubagentActivityLine({
  status,
  activity,
  className,
}: {
  status: SubagentDisplayStatus;
  activity?: SubagentActivity;
  className?: string;
}) {
  const running = status === "running";
  return (
    <span
      className={cn(
        "text-tau-sm text-ink-3 flex min-w-0 items-center gap-1.5 [&_svg]:size-3 [&_svg]:shrink-0",
        className
      )}
    >
      {running ? <Loader strokeWidth={1.75} /> : <Clock strokeWidth={1.75} />}
      <span
        className={cn(
          "min-w-0 truncate",
          running &&
            "animate-shimmer motion-reduce:animate-none bg-[linear-gradient(90deg,var(--tau-ink-3)_25%,var(--tau-ink-1)_50%,var(--tau-ink-3)_75%)] bg-[length:200%_100%] bg-clip-text text-transparent motion-reduce:text-ink-3"
        )}
      >
        {running ? describeActivity(activity) : "等待空位"}
      </span>
    </span>
  );
}

/** 一行一句的结果 / 错误摘要 */
export function SubagentOutcomeLine({
  tone,
  children,
  className,
}: {
  tone: "ok" | "danger" | "warn" | "muted";
  children: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-tau-sm flex min-w-0 items-center gap-1.5 [&_svg]:size-3 [&_svg]:shrink-0",
        tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-ink-3",
        className
      )}
    >
      {tone === "danger" && <CircleAlert strokeWidth={1.75} />}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}
