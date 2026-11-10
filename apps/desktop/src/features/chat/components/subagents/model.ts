import type { PiSessionInteractionSnapshot } from "@/types/pi-session";
import type { SubagentRun, SubagentRunStatus, SubagentView } from "@/types/subagent";

/** 界面状态：执行状态之上叠加「等用户回答 / 审批」 */
export type SubagentDisplayStatus = SubagentRunStatus | "question" | "approval" | "idle";

export const STATUS_LABEL: Record<SubagentDisplayStatus, string> = {
  queued: "排队中",
  running: "执行中",
  question: "等你回答",
  approval: "等你审批",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
  interrupted: "已中断",
  idle: "空闲",
};

/** 最近一次执行：优先正在跑的，其次最新提交的 */
export const currentRun = (view: SubagentView): SubagentRun | undefined =>
  [...view.runs].reverse().find(run => run.status === "running") ?? view.runs.at(-1);

export const displayStatus = (
  view: SubagentView,
  interactions?: PiSessionInteractionSnapshot
): SubagentDisplayStatus => {
  if (interactions?.questions.length) return "question";
  if (interactions?.approvals.length) return "approval";
  return currentRun(view)?.status ?? "idle";
};

export const needsUser = (status: SubagentDisplayStatus) =>
  status === "question" || status === "approval";
export const isActive = (status: SubagentDisplayStatus) =>
  status === "running" || status === "queued" || needsUser(status);

export const avatarInitial = (title: string) => {
  const first = [...title.trim()][0] ?? "子";
  return /[a-z]/i.test(first) ? first.toUpperCase() : first;
};

export const formatElapsed = (ms: number) => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} 分 ${String(seconds % 60).padStart(2, "0")} 秒`;
};

/** 已用时长：排队不计入；结束后固定 */
export const runElapsed = (run: SubagentRun | undefined, now: number): number | undefined => {
  if (!run?.startedAt) return undefined;
  return (run.finishedAt ?? now) - run.startedAt;
};

export const errorText = (run: SubagentRun | undefined) =>
  run?.outcome && "error" in run.outcome ? run.outcome.error.message : undefined;
