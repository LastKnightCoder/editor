import type { SubmissionEvent, SubmissionStatus } from "../../../../contracts";

const DECISION_TEXT = {
  approve: "审核通过",
  request_changes: "要求修改",
  reject: "未通过审核",
} as const;

/**
 * 列表第二行：优先讲最近一条审核/沟通，没有动态时说明当前该做什么。
 * viewer 决定留言的称呼：作者看到自己的留言是「我」。
 * 曾提交过又回到草稿的记录（submittedAt 非空）是作者撤回的结果，按角色换说法。
 */
export function activityText(
  item: {
    status: SubmissionStatus;
    lastEvent: SubmissionEvent | null;
    hasPackage: boolean;
    submittedAt?: string | null;
  },
  viewer: "author" | "reviewer"
): string {
  const event = item.lastEvent;
  if (event) {
    if (event.kind === "review") {
      const what = DECISION_TEXT[event.decision ?? "approve"];
      return event.excerpt ? `${what}：${event.excerpt}` : what;
    }
    const mine = (viewer === "author") === (event.role === "author");
    const who = mine ? "我" : event.role === "reviewer" ? "审核者" : "作者";
    return `${who}留言：${event.excerpt}`;
  }
  switch (item.status) {
    case "draft":
      if (item.submittedAt)
        return viewer === "author" ? "已撤回，可继续修改后重新提交" : "作者已撤回，等待重新提交";
      return item.hasPackage ? "已上传插件包，尚未提交审核" : "还没有上传插件包";
    case "pending_review":
      return "已提交，等待审核";
    case "changes_requested":
      return "需要按审核意见修改后重新提交";
    case "rejected":
      return "未通过审核";
    case "approved":
      return "审核通过";
  }
}
