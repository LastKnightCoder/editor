import type { ReviewDecision } from "../../../../contracts";

export const DECISION_LABELS: Record<ReviewDecision, string> = {
  approve: "批准并发布",
  request_changes: "要求修改",
  reject: "拒绝",
};
