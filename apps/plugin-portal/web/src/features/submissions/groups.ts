import type { SubmissionGroup, SubmissionStatus, SubmissionSummary } from "../../../../contracts";

const ATTENTION: SubmissionStatus[] = ["changes_requested", "draft", "pending_review"];

/** 一组提交里最该被看到的那条：待作者处理的优先，其次审核中，否则取最新 */
export function headlineOf(group: SubmissionGroup): SubmissionSummary {
  for (const status of ATTENTION) {
    const hit = group.submissions.find(item => item.status === status);
    if (hit) return hit;
  }
  return group.submissions[0];
}

export function lastActivity(item: SubmissionSummary): string {
  const event = item.lastEvent?.createdAt ?? "";
  return event > item.updatedAt ? event : item.updatedAt;
}
