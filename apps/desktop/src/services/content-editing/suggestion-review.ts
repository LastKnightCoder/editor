import { acceptContentSuggestions, listContentSuggestions } from "@/commands/content";
import { bindDatabaseCommands } from "@/services/command-context";
import type { ContentSuggestion } from "@/types/content-suggestion";
import type { ToolExecutionContext, ToolExecutionResult } from "@/types";
import type { ApplyProposalParams } from "./proposal-actions";
import { getContentEditProposal, useContentEditReviewStore } from "./proposal-store";
import { createReviewToolResult } from "./review-session-render";
import { useContentEditReviewSessionStore } from "./review-session-store";
import { createCheckpointId, now } from "./review-session-helpers";
import { invalidateContentSnapshots } from "./snapshot-store";
import { watchProposal } from "./suggestion-watch";
import type { ContentEditCheckpointRecord, ContentEditProposalRecord } from "./types";

/** 条目都已有结果：没有待处理的，也没有正在提交的（applying 且带错误的是结果未确认，可按原身份重送） */
export const suggestionsSettled = (items: ContentSuggestion[]) =>
  items.every(item => item.status !== "pending" && !(item.status === "applying" && !item.error));

/**
 * 按主进程的逐条结果回写提案外壳（状态、可撤销的检查点），并整理成交给 Agent 的逐条摘要。
 * 状态的唯一来源是主进程建议记录，这里只是投影。
 */
const summarizeSuggestionProposal = (
  proposal: ContentEditProposalRecord,
  items: ContentSuggestion[]
) => {
  const accepted = items.filter(item => item.status === "accepted");
  const unsettled = items.some(item => item.status === "applying");
  let checkpoint: ContentEditCheckpointRecord | undefined;
  if (accepted.length) {
    checkpoint = {
      databaseName: proposal.databaseName,
      contentId: proposal.contentId,
      proposalId: proposal.proposalId,
      checkpointId: proposal.checkpointId ?? createCheckpointId(),
      filePath: "",
      suggestionIds: accepted.map(item => item.id),
      beforeHash: proposal.beforeHash,
      afterHash: proposal.afterHash,
      createdAt: now(),
      updatedAt: now(),
    };
    useContentEditReviewStore.getState().upsertCheckpoint(checkpoint);
  }
  const conflicted = !accepted.length && items.some(item => item.status === "expired");
  const failure = items.find(item => item.status === "expired" || item.status === "applying");
  useContentEditReviewStore.getState().updateProposal(proposal.proposalId, current => ({
    ...current,
    status: accepted.length
      ? "applied"
      : conflicted
        ? "apply_conflicted"
        : items.length && items.every(item => item.status === "rejected")
          ? "rejected"
          : current.status,
    checkpointId: checkpoint?.checkpointId ?? current.checkpointId,
    commitPending: unsettled,
    lastError: failure?.error,
    updatedAt: now(),
  }));
  return {
    checkpoint,
    unsettled,
    items: items.map(item => ({
      id: item.id,
      ...(item.status === "expired"
        ? {
            blockId:
              item.edit.kind === "text"
                ? item.edit.blockId
                : (item.edit.expected[0]?.collabId ??
                  item.edit.left ??
                  item.edit.right ??
                  undefined),
          }
        : {}),
      status: item.status,
      beforeText: item.beforeText,
      afterText: item.afterText,
      ...(item.feedback ? { feedback: item.feedback } : {}),
      ...(item.error ? { error: item.error } : {}),
    })),
  };
};

/** 同一操作最多补交一次；IPC 回应丢失时以主进程逐条记录为准。 */
export async function reconcileSuggestionCommit(
  proposal: ContentEditProposalRecord,
  options: Pick<ApplyProposalParams, "signal" | "executionId" | "requireDirectPermission">
) {
  const { signal, executionId, requireDirectPermission } = options;
  const commands = bindDatabaseCommands(
    { listContentSuggestions, acceptContentSuggestions },
    { databaseName: proposal.databaseName, signal }
  );
  const list = () => commands.listContentSuggestions({ proposalId: proposal.proposalId });
  let items: ContentSuggestion[];
  try {
    items = await list();
    const applying = items.filter(item => item.status === "applying" && item.mode === "direct");
    if (applying.length && executionId) {
      signal?.throwIfAborted();
      try {
        await commands.acceptContentSuggestions(
          proposal.contentId,
          applying.map(item => item.id),
          {
            executionId,
            requireDirectPermission,
            onlyApplying: true,
          }
        );
      } catch {
        signal?.throwIfAborted();
        // IPC 回应可能在提交后丢失，仍以随后的逐条记录为准。
      }
      items = await list();
    }
  } catch {
    useContentEditReviewStore.getState().updateProposal(proposal.proposalId, current => ({
      ...current,
      commitPending: true,
      updatedAt: now(),
    }));
    signal?.throwIfAborted();
    return {
      success: false as const,
      proposalId: proposal.proposalId,
      errorCode: "COMMIT_PENDING",
      message: "暂时无法确认上次修改的结果，下次编辑时会再次核对。",
    };
  }
  if (!items.length) {
    const message =
      "原提交记录已不存在，无法确认该修改是否生效。请重读正文，只提交仍需进行的修改。";
    useContentEditReviewStore.getState().updateProposal(proposal.proposalId, current => ({
      ...current,
      commitPending: false,
      lastError: message,
      updatedAt: now(),
    }));
    invalidateContentSnapshots(
      proposal.databaseName?.replace(/\.db$/, "") ?? "",
      proposal.contentId
    );
    return {
      success: false as const,
      proposalId: proposal.proposalId,
      errorCode: "SNAPSHOT_EXPIRED",
      message,
    };
  }
  return { success: true as const, ...summarizeSuggestionProposal(proposal, items) };
}

/** 接受选中的条目（缺省全部待处理）；已被另一视图处理的条目原样返回其结果。 */
export const acceptSuggestions = async (
  proposal: ContentEditProposalRecord,
  params: ApplyProposalParams
) => {
  const commands = bindDatabaseCommands(
    { listContentSuggestions, acceptContentSuggestions },
    { databaseName: proposal.databaseName, signal: params.signal }
  );
  const before = await commands.listContentSuggestions({ proposalId: proposal.proposalId });
  const accept = before.filter(
    item =>
      (item.status === "applying" || (!params.executionId && item.status === "pending")) &&
      (!params.suggestionIds || params.suggestionIds.includes(item.id))
  );
  if (accept.length)
    await commands.acceptContentSuggestions(
      proposal.contentId,
      accept.map(item => item.id),
      { executionId: params.executionId, requireDirectPermission: params.requireDirectPermission }
    );
  const items = await commands.listContentSuggestions({ proposalId: proposal.proposalId });
  const summary = summarizeSuggestionProposal(proposal, items);
  if (summary.unsettled || (accept.length && !items.some(item => item.status === "accepted")))
    return {
      success: false as const,
      errorCode: summary.unsettled ? "COMMIT_PENDING" : "SCOPE_CONFLICT",
      message: summary.unsettled
        ? "提交结果尚未确认，请勿重复创建写入"
        : "目标范围已变化，请重新读取后再修改",
      proposalId: proposal.proposalId,
      items: summary.items,
    };
  return { success: true as const, checkpoint: summary.checkpoint, items: summary.items };
};

/**
 * 逐条建议的提案：等该提案的每一条都被处理（任意窗口的原对话卡片，先到先得），
 * 再把逐条结果交给 Agent。期间工具调用保持等待；用户中止对话时等待结束，未处理的条目留在对话卡片里。
 */
export const awaitSuggestionDecisions = (params: {
  context: ToolExecutionContext;
  proposal: ContentEditProposalRecord;
  sessionId: string;
  proposedMarkdown?: string;
}) =>
  new Promise<ToolExecutionResult>((resolve, reject) => {
    const { proposal, sessionId } = params;
    const onAbort = () =>
      useContentEditReviewSessionStore.getState().cancelSession(sessionId, "内容审阅会话已中止");
    const watch = watchProposal({
      databaseName: proposal.databaseName,
      proposalId: proposal.proposalId,
      onItems: items => {
        if (!items.length || !suggestionsSettled(items)) return false;
        params.context.signal?.removeEventListener("abort", onAbort);
        const summary = summarizeSuggestionProposal(proposal, items);
        useContentEditReviewSessionStore.getState().completeSession(sessionId);
        const feedback = items
          .flatMap(item => (item.status === "rejected" && item.feedback ? [item.feedback] : []))
          .join("；");
        resolve(
          createReviewToolResult({
            action: items.some(item => item.status === "accepted")
              ? "applied"
              : feedback
                ? "feedback"
                : "rejected",
            proposal: getContentEditProposal(proposal.proposalId) ?? proposal,
            proposedMarkdown: params.proposedMarkdown,
            ...(feedback ? { feedback } : {}),
            items: summary.items,
          })
        );
        return true;
      },
      onError: error => {
        params.context.signal?.removeEventListener("abort", onAbort);
        useContentEditReviewSessionStore
          .getState()
          .cancelSession(sessionId, error.message || "内容审阅执行失败");
        reject(error);
      },
    });
    params.context.signal?.addEventListener("abort", onAbort, { once: true });
    useContentEditReviewSessionStore.getState().registerResolver(sessionId, {
      // 对话卡片的批量按钮直接改主进程记录；这里只需按最新记录再判断一次
      resolve: () => watch.recheck(),
      reject: error => {
        watch.stop();
        params.context.signal?.removeEventListener("abort", onAbort);
        reject(error);
      },
    });
    if (params.context.signal?.aborted) onAbort();
  });

/**
 * 有直接改权限时：不等审阅，逐条实时落地（本机正文逐段打字，有人在编辑那一块就停手让出），
 * 让出与过期的条目留在对话卡片里等用户决定，结果立即交给 Agent。
 */
export const applyDirectSuggestions = async (
  proposal: ContentEditProposalRecord,
  signal?: AbortSignal,
  executionId?: string,
  requireDirectPermission?: boolean
): Promise<ToolExecutionResult> => {
  if (!executionId) throw new Error("正文直接改缺少有效的工具执行身份");
  const commands = bindDatabaseCommands(
    { listContentSuggestions, acceptContentSuggestions },
    { databaseName: proposal.databaseName, signal }
  );
  const before = await commands.listContentSuggestions({ proposalId: proposal.proposalId });
  const pending = before.filter(item => item.status === "pending").map(item => item.id);
  let submitError: unknown;
  if (pending.length) {
    try {
      await commands.acceptContentSuggestions(proposal.contentId, pending, {
        typing: true,
        executionId,
        requireDirectPermission,
      });
    } catch (error) {
      submitError = error;
    }
  }
  const summary = await reconcileSuggestionCommit(proposal, {
    signal,
    executionId,
    requireDirectPermission,
  });
  if (!summary.success) return { content: JSON.stringify(summary) };
  if (submitError && summary.items.every(item => item.status === "pending")) throw submitError;
  return createReviewToolResult({
    action: summary.unsettled ? "commit_pending" : summary.checkpoint ? "applied" : "rejected",
    proposal: getContentEditProposal(proposal.proposalId) ?? proposal,
    items: summary.items,
    direct: true,
  });
};
