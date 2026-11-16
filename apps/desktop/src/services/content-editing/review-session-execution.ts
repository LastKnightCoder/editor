import type { ToolExecutionContext, ToolExecutionResult } from "@/types";
import { applyContentEditProposal, rejectContentEditProposal } from "./proposal-actions";
import { readProposalCache, stringifySafe } from "./review-session-helpers";
import { buildRendererPayload, createReviewToolResult } from "./review-session-render";
import {
  useContentEditReviewSessionStore,
  type ContentEditReviewExecutionLocator,
} from "./review-session-store";
import { awaitSuggestionDecisions } from "./suggestion-review";
import type {
  ContentEditProposalRecord,
  ContentEditRendererPayload,
  ContentEditReviewDecision,
} from "./types";

export const createPendingContentEditReview = async (params: {
  context: ToolExecutionContext;
  proposal: ContentEditProposalRecord;
  matched?: ContentEditRendererPayload["matched"];
}) => {
  console.log("[createPendingContentEditReview] 开始创建待审核会话", {
    toolCallId: params.context.toolCallId,
    proposalId: params.proposal.proposalId,
    conversationKey: params.proposal.conversationKey,
  });

  const proposalCache = await readProposalCache(params.proposal.proposalFilePath);
  const proposedMarkdown = proposalCache?.markdown;
  const payload = buildRendererPayload({
    proposal: params.proposal,
    beforeMarkdown: params.proposal.beforeMarkdown,
    proposedMarkdown,
    matched: params.matched,
  });
  const session = useContentEditReviewSessionStore.getState().createPending({
    toolCallId: params.context.toolCallId,
    toolName: params.context.toolName,
    conversationKey: params.proposal.conversationKey,
    rawInput: stringifySafe({
      toolName: params.context.toolName,
      proposalId: params.proposal.proposalId,
    }),
    proposalId: params.proposal.proposalId,
    payload,
  });

  console.log("[createPendingContentEditReview] 会话已创建，sessionId:", session.sessionId);

  if (params.context.signal?.aborted) {
    console.log("[createPendingContentEditReview] 会话已中止");
    useContentEditReviewSessionStore
      .getState()
      .cancelSession(session.sessionId, "内容审阅会话已中止");
    throw new Error("内容审阅会话已中止");
  }

  if (params.proposal.suggestions)
    return awaitSuggestionDecisions({
      context: params.context,
      proposal: params.proposal,
      sessionId: session.sessionId,
      proposedMarkdown,
    });

  console.log("[createPendingContentEditReview] 开始等待用户决策...");

  return await new Promise<ToolExecutionResult>((resolve, reject) => {
    const clearAbort = () => {
      if (params.context.signal) {
        params.context.signal.removeEventListener("abort", handleAbort);
      }
    };

    const handleAbort = () => {
      clearAbort();
      useContentEditReviewSessionStore
        .getState()
        .cancelSession(session.sessionId, "内容审阅会话已中止");
    };

    if (params.context.signal) {
      params.context.signal.addEventListener("abort", handleAbort, {
        once: true,
      });
    }

    useContentEditReviewSessionStore.getState().registerResolver(session.sessionId, {
      resolve: async decision => {
        console.log("[createPendingContentEditReview] 收到用户决策:", decision.action);
        clearAbort();
        try {
          if (decision.action === "apply") {
            console.log("[createPendingContentEditReview] 开始应用提案...");
            const applyResult = await applyContentEditProposal({
              proposalId: params.proposal.proposalId,
              signal: params.context.signal,
            });
            if (!applyResult.success) {
              useContentEditReviewSessionStore.getState().completeSession(session.sessionId);
              resolve({ content: JSON.stringify(applyResult) });
              return;
            }
            useContentEditReviewSessionStore.getState().completeSession(session.sessionId);
            console.log("[createPendingContentEditReview] 提案已应用，返回结果");
            resolve(
              createReviewToolResult({
                action: "applied",
                proposal: applyResult.proposal,
                proposedMarkdown,
              })
            );
            return;
          }

          if (decision.action === "feedback") {
            console.log("[createPendingContentEditReview] 开始提交反馈...");
            const rejectResult = await rejectContentEditProposal({
              proposalId: params.proposal.proposalId,
              feedback: decision.feedback,
            });
            if (!rejectResult.success) {
              throw new Error(rejectResult.message || "提交修改意见失败");
            }
            useContentEditReviewSessionStore.getState().completeSession(session.sessionId);
            console.log("[createPendingContentEditReview] 反馈已提交，返回结果");
            resolve(
              createReviewToolResult({
                action: "feedback",
                proposal: rejectResult.proposal,
                proposedMarkdown,
                feedback: decision.feedback,
              })
            );
            return;
          }

          console.log("[createPendingContentEditReview] 开始拒绝提案...");
          const rejectResult = await rejectContentEditProposal({
            proposalId: params.proposal.proposalId,
          });
          if (!rejectResult.success) {
            throw new Error(rejectResult.message || "拒绝提案失败");
          }
          useContentEditReviewSessionStore.getState().completeSession(session.sessionId);
          console.log("[createPendingContentEditReview] 提案已拒绝，返回结果");
          resolve(
            createReviewToolResult({
              action: "rejected",
              proposal: rejectResult.proposal,
              proposedMarkdown,
            })
          );
        } catch (error) {
          console.error("[createPendingContentEditReview] 执行决策时出错:", error);
          useContentEditReviewSessionStore
            .getState()
            .cancelSession(session.sessionId, (error as Error).message || "内容审阅执行失败");
          reject(error as Error);
        }
      },
      reject: error => {
        console.error("[createPendingContentEditReview] 会话被拒绝:", error);
        clearAbort();
        reject(error);
      },
    });
  });
};

/** 工具权限模式为「自动允许编辑 / 跳过确认」时：不弹审阅卡，直接应用并返回同构结果 */
export const autoApplyContentEditProposal = async (
  proposal: ContentEditProposalRecord,
  signal?: AbortSignal,
  executionId?: string,
  requireDirectPermission?: boolean
) => {
  const proposalCache = await readProposalCache(proposal.proposalFilePath);
  const applyResult = await applyContentEditProposal({
    proposalId: proposal.proposalId,
    signal,
    executionId,
    requireDirectPermission,
  });
  if (!applyResult.success) {
    return {
      content: JSON.stringify(applyResult, null, 2),
    };
  }
  const result = createReviewToolResult({
    action: "applied",
    proposal: applyResult.proposal,
    proposedMarkdown: proposalCache?.markdown,
  });
  return {
    ...result,
    content: result.content.replace("用户已确认应用修改", "已按工具权限模式自动应用修改"),
  };
};

export const submitContentEditReviewDecisionByExecution = (
  locator: ContentEditReviewExecutionLocator,
  decision: ContentEditReviewDecision
) => useContentEditReviewSessionStore.getState().submitDecisionByExecution(locator, decision);
