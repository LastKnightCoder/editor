import { resolveEditRequest, prepareEditRequest } from "./prepare-edit";
import { measurePerf } from "@/utils/perf-trace";
import { cacheFileExists } from "@/commands/cache";
import {
  createContentSuggestions,
  listContentSuggestions,
  rejectContentSuggestions,
  supersedeContentSuggestions,
  undoContentSuggestions,
} from "@/commands/content";
import { getChatDatabase } from "@/services/chatDatabase";
import { bindDatabaseCommands } from "@/services/command-context";
import type {
  AgentPermissionLevel,
  ContentSuggestion,
  ContentSuggestionMode,
} from "@/types/content-suggestion";
import { persistContentFromMarkdown, persistContentValue } from "./persist";
import {
  buildConversationKey,
  buildDiffSummary,
  createCheckpointId,
  createProposalId,
  now,
  persistCheckpointCache,
  persistProposalCache,
  readCheckpointCache,
  readProposalCache,
} from "./review-session-helpers";
import { buildRendererPayload, updateSessionContentIfNeeded } from "./review-session-render";
import { loadSnapshotForContent } from "./resolver";
import {
  getContentEditCheckpoint,
  getContentEditProposal,
  useContentEditReviewStore,
} from "./proposal-store";
import { acceptSuggestions, reconcileSuggestionCommit } from "./suggestion-review";
import type {
  ContentEditCheckpointRecord,
  ContentEditProposalRecord,
  ContentEditProposalStatus,
  EditOperation,
} from "./types";

/** 更新提案后立即回读；updateProposal 不删条目，读不到说明 store 被外部清空 */
const requireProposal = (proposalId: string): ContentEditProposalRecord => {
  const proposal = getContentEditProposal(proposalId);
  if (!proposal) throw new Error(`提案 ${proposalId} 更新后丢失`);
  return proposal;
};

interface CreateProposalParams {
  databaseName?: string;
  signal?: AbortSignal;
  executionId?: string;
  requireDirectPermission?: boolean;
  target?: { contentId?: number };
  baseHash?: string;
  snapshotId?: string;
  agentId?: string;
  agentLabel?: string;
  operations: EditOperation[];
  sourceToolName: string;
  conversationKey?: string;
  /** 按目标正文决定这次改动怎么落地：只读拒绝、建议待接受、直接改实时落地 */
  resolveMode?: (contentId: number) => Promise<AgentPermissionLevel>;
}

export interface ApplyProposalParams {
  proposalId: string;
  signal?: AbortSignal;
  /** 逐条建议时只接受这些条目；缺省为全部待处理条目 */
  suggestionIds?: string[];
  executionId?: string;
  requireDirectPermission?: boolean;
}

interface RestoreCheckpointParams {
  checkpointId: string;
  force?: boolean;
}

interface RejectProposalParams {
  proposalId: string;
  feedback?: string;
  nextStatus?: Extract<ContentEditProposalStatus, "rejected" | "superseded">;
}

export const createContentEditProposal = async (params: CreateProposalParams) => {
  params = { ...params, databaseName: params.databaseName ?? getChatDatabase() };
  const request = await resolveEditRequest(params);
  const { resolvedTarget, databaseName, captured } = request;
  const conversationKey = buildConversationKey(params.conversationKey, resolvedTarget);
  const level = (await params.resolveMode?.(resolvedTarget.contentId)) ?? "suggest";
  if (level === "readonly")
    return {
      success: false as const,
      errorCode: "READ_ONLY",
      message: `「${params.agentLabel ?? "助手"}」在这篇正文上只能读，不能改动；请在回复里说明你的建议`,
    };
  const mode: ContentSuggestionMode = level === "direct" ? "direct" : "suggest";
  const unsettled = Object.values(useContentEditReviewStore.getState().proposals).find(
    proposal =>
      proposal.conversationKey === conversationKey &&
      proposal.databaseName?.replace(/\.db$/, "") === databaseName &&
      proposal.contentId === resolvedTarget.contentId &&
      proposal.commitPending
  );
  if (unsettled) {
    const previous = await reconcileSuggestionCommit(unsettled, {
      signal: params.signal,
      executionId: mode === "direct" ? params.executionId : undefined,
      requireDirectPermission: params.requireDirectPermission,
    });
    if (!previous.success) return previous;
    if (previous.unsettled)
      return {
        success: false as const,
        errorCode: "COMMIT_PENDING",
        message: "上次修改的结果仍未确认。已保留原提交，下次编辑时会再次核对。",
        proposalId: unsettled.proposalId,
        items: previous.items,
      };
    // 补交可能改变了正文。只有本次操作确实基于恢复后的正文，才能继续。
    const { snapshot: latest } = await loadSnapshotForContent(
      resolvedTarget.contentId,
      params,
      true
    );
    const state = captured?.editState;
    if (
      !captured ||
      !state ||
      latest.markdown !== captured.markdown ||
      latest.editState?.identity.documentId !== state.identity.documentId ||
      latest.editState.identity.baselineId !== state.identity.baselineId ||
      latest.editState.identity.epoch !== state.identity.epoch
    )
      return {
        success: false as const,
        errorCode: "SNAPSHOT_EXPIRED",
        message: "上次提交的结果已核对，请重读当前正文，只提交仍需进行的修改。",
        proposalId: unsettled.proposalId,
        items: previous.items,
      };
  }
  const prepared = await measurePerf(
    "content.prepare-edit",
    () => prepareEditRequest(params, request),
    { contentId: resolvedTarget.contentId }
  );
  if (!prepared.success) return prepared;
  const { snapshot, source, editResult, scopedPlan } = prepared;
  const proposalId = createProposalId();
  const proposalFilePath = await persistProposalCache(proposalId, {
    markdown: editResult.markdown,
    baseline: snapshot.editState?.identity,
  });
  const timestamp = now();

  useContentEditReviewStore.getState().supersedePendingProposals({
    conversationKey,
    contentId: resolvedTarget.contentId,
    excludeProposalId: proposalId,
  });

  const proposal: ContentEditProposalRecord = {
    databaseName: params.databaseName,
    proposalId,
    conversationKey,
    contentId: resolvedTarget.contentId,
    sourceToolName: params.sourceToolName,
    status: "pending_review",
    beforeMarkdown: snapshot.markdown,
    beforeHash: snapshot.hash,
    afterHash: editResult.hash,
    snapshotId: snapshot.id,
    snapshotSource: source,
    targetSource: resolvedTarget.source,
    proposalFilePath,
    diffSummary: measurePerf("review.diff-summary", () => buildDiffSummary(editResult.patches), {
      contentId: resolvedTarget.contentId,
    }),
    patches: editResult.patches,
    createdAt: timestamp,
    updatedAt: timestamp,
    feedbackHistory: [],
    agentLabel: params.agentLabel,
    ...(scopedPlan ? { suggestions: true } : {}),
  };

  let suggestions: ContentSuggestion[] | undefined;
  if (scopedPlan && snapshot.editState) {
    const reasons = new Map(
      params.operations.map((operation, index) => [
        operation.id || `op_${index + 1}`,
        operation.reason?.trim(),
      ])
    );
    suggestions = await bindDatabaseCommands(
      { createContentSuggestions },
      { databaseName: params.databaseName, signal: params.signal }
    ).createContentSuggestions(resolvedTarget.contentId, {
      proposalId,
      conversationKey,
      ...(params.agentId ? { agentId: params.agentId } : {}),
      ...(params.agentLabel ? { agentLabel: params.agentLabel } : {}),
      mode,
      baseline: snapshot.editState.identity,
      ...(scopedPlan.contracts && Object.keys(scopedPlan.contracts).length
        ? { contracts: scopedPlan.contracts }
        : {}),
      items: scopedPlan.edits.map((edit, index) => {
        const patch = editResult.patches[index];
        const reason = (patch?.sourceOperationIds ?? [edit.id])
          .map(id => reasons.get(id))
          .filter(Boolean)
          .join("；");
        return {
          edit,
          beforeText: patch?.beforeText ?? "",
          afterText: patch?.afterText ?? "",
          ...(reason ? { reason } : {}),
        };
      }),
    });
  }
  useContentEditReviewStore.getState().upsertProposal(proposal);

  return {
    success: true as const,
    proposal,
    suggestions,
    mode,
    rendererPayload: buildRendererPayload({
      proposal,
      beforeMarkdown: snapshot.markdown,
    }),
  };
};

export const applyContentEditProposal = async (params: ApplyProposalParams) => {
  const proposal = getContentEditProposal(params.proposalId);
  if (!proposal) {
    return {
      success: false as const,
      errorCode: "PROPOSAL_NOT_FOUND",
      message: `未找到提案 ${params.proposalId}`,
    };
  }

  const cachePayload = await readProposalCache(proposal.proposalFilePath);
  if (typeof cachePayload?.markdown !== "string") {
    useContentEditReviewStore.getState().updateProposal(proposal.proposalId, current => ({
      ...current,
      lastError: "提案文件不存在或已损坏，无法应用",
      updatedAt: now(),
    }));
    return {
      success: false as const,
      errorCode: "PROPOSAL_CACHE_MISSING",
      message: "提案文件不存在或已损坏，无法应用",
    };
  }

  const scope = { databaseName: proposal.databaseName, signal: params.signal };
  if (proposal.suggestions) {
    const decided = await acceptSuggestions(proposal, params);
    if (!decided.success) return decided;
    const applied = requireProposal(proposal.proposalId);
    return {
      success: true as const,
      proposal: applied,
      checkpoint: decided.checkpoint,
      items: decided.items,
      rendererPayload: buildRendererPayload({ proposal: applied }),
    };
  }
  const { snapshot } = await (cachePayload.baseline
    ? loadSnapshotForContent(proposal.contentId, scope, true)
    : loadSnapshotForContent(proposal.contentId, scope));
  const baseline = cachePayload.baseline;
  const identity = snapshot.editState?.identity;
  if (
    snapshot.hash !== proposal.beforeHash ||
    (baseline &&
      (identity?.documentId !== baseline.documentId ||
        identity.baselineId !== baseline.baselineId ||
        identity.epoch !== baseline.epoch))
  ) {
    useContentEditReviewStore.getState().updateProposal(proposal.proposalId, current => ({
      ...current,
      status: "apply_conflicted",
      lastError: "内容在提案生成后已发生变化，无法直接应用",
      updatedAt: now(),
    }));
    const conflicted = requireProposal(proposal.proposalId);
    return {
      success: false as const,
      errorCode: "CONTENT_CONFLICT",
      message: "内容在提案生成后已发生变化，无法直接应用",
      rendererPayload: buildRendererPayload({ proposal: conflicted }),
    };
  }

  const checkpointId = createCheckpointId();
  const checkpointFilePath = await persistCheckpointCache(checkpointId, {
    content: snapshot.content,
    markdown: snapshot.markdown,
    hash: snapshot.hash,
  });
  const checkpoint: ContentEditCheckpointRecord = {
    databaseName: proposal.databaseName,
    checkpointId,
    proposalId: proposal.proposalId,
    contentId: proposal.contentId,
    beforeHash: snapshot.hash,
    afterHash: proposal.afterHash,
    filePath: checkpointFilePath,
    createdAt: now(),
    updatedAt: now(),
  };
  useContentEditReviewStore.getState().upsertCheckpoint(checkpoint);

  const persisted = await persistContentFromMarkdown({
    scope,
    contentId: proposal.contentId,
    markdown: cachePayload.markdown,
    expectedRevision: snapshot.revision,
    sourceUuid: `content-edit-proposal:${proposal.proposalId}`,
  });
  if (!proposal.databaseName || proposal.databaseName.replace(/\.db$/, "") === getChatDatabase())
    updateSessionContentIfNeeded(proposal.contentId, persisted.content);

  useContentEditReviewStore.getState().updateProposal(proposal.proposalId, current => ({
    ...current,
    status: "applied",
    checkpointId,
    updatedAt: now(),
    lastError: undefined,
  }));

  const applied = requireProposal(proposal.proposalId);
  return {
    success: true as const,
    proposal: applied,
    checkpoint,
    rendererPayload: buildRendererPayload({ proposal: applied }),
  };
};

export const rejectContentEditProposal = async (params: RejectProposalParams) => {
  const proposal = getContentEditProposal(params.proposalId);
  if (!proposal) {
    return {
      success: false as const,
      errorCode: "PROPOSAL_NOT_FOUND",
      message: `未找到提案 ${params.proposalId}`,
    };
  }

  if (proposal.suggestions) {
    const commands = bindDatabaseCommands(
      { rejectContentSuggestions, supersedeContentSuggestions, listContentSuggestions },
      { databaseName: proposal.databaseName }
    );
    if (params.nextStatus === "superseded")
      await commands.supersedeContentSuggestions(proposal.contentId, proposal.proposalId);
    else {
      const pending = (
        await commands.listContentSuggestions({ proposalId: proposal.proposalId })
      ).filter(item => item.status === "pending" || item.status === "expired");
      if (pending.length)
        await commands.rejectContentSuggestions(
          proposal.contentId,
          pending.map(item => item.id),
          params.feedback
        );
    }
  }
  const nextStatus = params.nextStatus || "rejected";
  useContentEditReviewStore.getState().updateProposal(proposal.proposalId, current => ({
    ...current,
    status: nextStatus,
    feedbackHistory: params.feedback?.trim()
      ? [...current.feedbackHistory, params.feedback.trim()]
      : current.feedbackHistory,
    updatedAt: now(),
    lastError: undefined,
  }));

  const updated = requireProposal(proposal.proposalId);
  return {
    success: true as const,
    proposal: updated,
    rendererPayload: buildRendererPayload({ proposal: updated }),
  };
};

export const restoreContentCheckpoint = async (params: RestoreCheckpointParams) => {
  const checkpoint = getContentEditCheckpoint(params.checkpointId);
  if (!checkpoint) {
    return {
      success: false as const,
      errorCode: "CHECKPOINT_NOT_FOUND",
      message: `未找到检查点 ${params.checkpointId}`,
    };
  }

  if (checkpoint.suggestionIds) {
    const outcomes = await bindDatabaseCommands(
      { undoContentSuggestions },
      checkpoint
    ).undoContentSuggestions(checkpoint.contentId, checkpoint.suggestionIds);
    const failed = outcomes.find(outcome => outcome.status !== "undone");
    if (failed || !outcomes.length)
      return {
        success: false as const,
        errorCode: "SCOPE_CONFLICT",
        message: failed?.error ?? "没有可撤销的修改",
      };
    return finishRestore(checkpoint);
  }

  const checkpointExists = await cacheFileExists(checkpoint.filePath);
  if (!checkpointExists) {
    useContentEditReviewStore.getState().updateCheckpoint(checkpoint.checkpointId, current => ({
      ...current,
      lastRestoreError: "检查点文件已丢失，无法恢复",
      updatedAt: now(),
    }));
    return {
      success: false as const,
      errorCode: "CHECKPOINT_CACHE_MISSING",
      message: "检查点文件已丢失，无法恢复",
    };
  }

  const checkpointPayload = await readCheckpointCache(checkpoint.filePath);
  if (!checkpointPayload) {
    return {
      success: false as const,
      errorCode: "CHECKPOINT_CACHE_INVALID",
      message: "检查点文件已损坏，无法恢复",
    };
  }

  const { snapshot } = await loadSnapshotForContent(checkpoint.contentId, checkpoint);
  if (!params.force && snapshot.hash !== checkpoint.afterHash) {
    return {
      success: false as const,
      errorCode: "RESTORE_CONFLICT",
      message: "当前内容在 AI 应用后又发生了修改，恢复会覆盖后续更改",
      currentHash: snapshot.hash,
      expectedHash: checkpoint.afterHash,
    };
  }

  const persisted = await persistContentValue({
    scope: checkpoint,
    contentId: checkpoint.contentId,
    content: checkpointPayload.content,
    expectedRevision: snapshot.revision,
    sourceUuid: `content-edit-restore:${checkpoint.checkpointId}`,
  });
  if (
    !checkpoint.databaseName ||
    checkpoint.databaseName.replace(/\.db$/, "") === getChatDatabase()
  )
    updateSessionContentIfNeeded(checkpoint.contentId, persisted.content);

  return finishRestore(checkpoint);
};

const finishRestore = (checkpoint: ContentEditCheckpointRecord) => {
  useContentEditReviewStore.getState().updateCheckpoint(checkpoint.checkpointId, current => ({
    ...current,
    restoredAt: now(),
    updatedAt: now(),
    lastRestoreError: undefined,
  }));

  const proposal = getContentEditProposal(checkpoint.proposalId);
  if (proposal) {
    useContentEditReviewStore.getState().updateProposal(checkpoint.proposalId, current => ({
      ...current,
      status: "restored",
      updatedAt: now(),
      lastError: undefined,
    }));
  }

  const updatedProposal = proposal ? getContentEditProposal(checkpoint.proposalId) : undefined;

  return {
    success: true as const,
    checkpoint: getContentEditCheckpoint(checkpoint.checkpointId),
    proposal: updatedProposal,
    rendererPayload: updatedProposal
      ? buildRendererPayload({ proposal: updatedProposal })
      : undefined,
  };
};
