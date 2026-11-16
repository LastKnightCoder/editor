import type { ToolExecutionResult } from "@/types";
import type { ContentSuggestion } from "@/types/content-suggestion";
import {
  getActiveEditingSessionByContentId,
  updateActiveEditingSessionContent,
} from "./active-editor-session";
import { now } from "./review-session-helpers";
import type {
  ContentEditProposalRecord,
  ContentEditRendererPayload,
  ContentEditReviewToolResult,
  ContentSnapshot,
} from "./types";

export const updateSessionContentIfNeeded = (
  contentId: number,
  content: ContentSnapshot["content"]
) => {
  const session = getActiveEditingSessionByContentId(contentId);
  if (!session) return;
  updateActiveEditingSessionContent(session.id, content);
};

export const buildRendererPayload = (payload: {
  proposal: ContentEditProposalRecord;
  beforeMarkdown?: string;
  proposedMarkdown?: string;
  matched?: ContentEditRendererPayload["matched"];
}) => {
  const { proposal, beforeMarkdown, proposedMarkdown, matched } = payload;
  return {
    kind: "content-edit-proposal",
    proposalId: proposal.proposalId,
    conversationKey: proposal.conversationKey,
    contentId: proposal.contentId,
    sourceToolName: proposal.sourceToolName,
    status: proposal.status,
    beforeHash: proposal.beforeHash,
    afterHash: proposal.afterHash,
    snapshotId: proposal.snapshotId,
    diffSummary: proposal.diffSummary,
    patches: proposal.patches,
    checkpointId: proposal.checkpointId,
    targetSource: proposal.targetSource,
    lastError: proposal.lastError,
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
    beforeMarkdown,
    proposedMarkdown,
    matched,
  } satisfies ContentEditRendererPayload;
};

/** 逐条结果的一句话说明：告诉 Agent 哪些已落地、哪些要按意见重做、哪些要重读后再提 */
const describeSuggestionItems = (
  items: NonNullable<ContentEditReviewToolResult["items"]>,
  direct = false
) => {
  const count = (status: ContentSuggestion["status"]) =>
    items.filter(item => item.status === status).length;
  const withFeedback = items.filter(item => item.status === "rejected" && item.feedback).length;
  if (direct) {
    const parts = [
      count("accepted") && `直接改好 ${count("accepted")} 处（用户可在本对话的修改记录里撤销）`,
      count("pending") &&
        `${count("pending")} 处因用户正在编辑那一段先停下，已留作待处理，用户决定是否让你接着改`,
      count("expired") && `${count("expired")} 处已过期（用条目的 blockId 重读原文后再提）`,
      count("applying") && `${count("applying")} 处提交结果尚未确认（用 resumeProposalId 补交）`,
    ].filter(Boolean);
    return `已按直接改权限落地：${parts.join("；") || "没有可改的条目"}`;
  }
  const parts = [
    count("accepted") && `接受 ${count("accepted")} 条`,
    count("rejected") &&
      `退回 ${count("rejected")} 条${withFeedback ? `（${withFeedback} 条附意见，只按意见重做这些条）` : ""}`,
    count("expired") && `${count("expired")} 条已过期（用条目的 blockId 重读原文后再提）`,
    count("applying") && `${count("applying")} 条提交结果尚未确认（用 resumeProposalId 补交）`,
  ].filter(Boolean);
  return `用户已处理全部建议：${parts.join("；") || "没有可处理的条目"}`;
};

export const createReviewToolResult = (payload: {
  action: ContentEditReviewToolResult["action"];
  proposal: ContentEditProposalRecord;
  proposedMarkdown?: string;
  feedback?: string;
  items?: ContentEditReviewToolResult["items"];
  /** 按直接改权限落地，不经审阅 */
  direct?: boolean;
}): ToolExecutionResult => {
  const result: ContentEditReviewToolResult = {
    type: "content-edit-review-result",
    action: payload.action,
    submittedAt: now(),
    contentId: payload.proposal.contentId,
    proposalId: payload.proposal.proposalId,
    conversationKey: payload.proposal.conversationKey,
    checkpointId: payload.proposal.checkpointId,
    message: payload.items
      ? describeSuggestionItems(payload.items, payload.direct)
      : payload.action === "applied"
        ? "用户已确认应用修改"
        : payload.action === "feedback"
          ? "用户未确认当前修改，并给出了新的修改意见"
          : "用户拒绝了当前修改",
    ...(payload.feedback ? { feedback: payload.feedback } : {}),
    ...(payload.items ? { items: payload.items } : {}),
    proposal: {
      sourceToolName: payload.proposal.sourceToolName,
      proposedMarkdown: payload.proposedMarkdown,
      diffSummary: payload.proposal.diffSummary,
      patches: payload.proposal.patches,
    },
  };
  return {
    content: JSON.stringify(result, null, 2),
    metadata: {
      render: {
        rendererKey: "content-edit-proposal",
        payload: {
          kind: "content-edit-review-result",
          ...result,
        },
      },
    },
  };
};
