import type { Submission, SubmissionEvent } from "../../../../contracts";

const DECISION_TEXT = {
  approve: "审核通过",
  request_changes: "要求修改",
  reject: "拒绝",
} as const;

/** 列表第二行：优先讲最近一条审核/沟通，没有动态时说明当前该做什么 */
export function activityText(submission: Submission): string {
  const event: SubmissionEvent | null = submission.lastEvent;
  if (event) {
    const who = event.role === "reviewer" ? "审核者" : "作者";
    const what = event.kind === "review" ? DECISION_TEXT[event.decision ?? "approve"] : "留言";
    return event.excerpt ? `${who}${what}：${event.excerpt}` : `${who}${what}`;
  }
  switch (submission.status) {
    case "draft":
      return submission.content ? "已上传插件包，尚未提交审核" : "还没有上传插件包";
    case "pending_review":
      return "已提交，等待审核";
    case "changes_requested":
      return "需要按审核意见修改后重新提交";
    case "rejected":
      return "审核未通过";
    case "approved":
      return "已批准";
  }
}
