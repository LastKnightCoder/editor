import { create } from "zustand";
import { getChatDatabase } from "@/services/chatDatabase";
import { persist } from "zustand/middleware";
import { writeCacheFile, readCacheFile, cacheFileExists } from "@/commands/cache";
import type { ToolExecutionContext, ToolExecutionResult } from "@/types";
import {
  getActiveEditingSessionByContentId,
  updateActiveEditingSessionContent,
} from "./active-editor-session";
import { computeCharDiff } from "@/utils/char-diff";
import { applyEditOperations } from "./edit-engine";
import { persistContentFromMarkdown, persistContentValue } from "./persist";
import { loadSnapshotForContent, resolveContentTarget } from "./resolver";
import { getSnapshot, getRangeByMatchId } from "./snapshot-store";
import {
  acceptContentSuggestions,
  createContentSuggestions,
  listContentSuggestions,
  rejectContentSuggestions,
  supersedeContentSuggestions,
  undoContentSuggestions,
} from "@/commands/content";
import { bindDatabaseCommands } from "@/services/command-context";
import { isElectron } from "@/electron";
import type {
  AgentPermissionLevel,
  ContentSuggestion,
  ContentSuggestionMode,
} from "@/types/content-suggestion";
import { compileScopedPlan } from "./scoped-plan";
import { watchProposal } from "./suggestion-watch";
import type {
  ContentEditCheckpointCachePayload,
  ContentEditCheckpointRecord,
  ContentEditReviewDecision,
  ContentEditReviewSessionRecord,
  ContentEditReviewSessionStatus,
  ContentEditReviewToolResult,
  ContentEditProposalCachePayload,
  ContentEditProposalRecord,
  ContentEditProposalStatus,
  ContentEditRendererPayload,
  ContentSnapshot,
  EditOperation,
  ResolvedContentTarget,
} from "./types";

interface ContentEditReviewState {
  proposals: Record<string, ContentEditProposalRecord>;
  checkpoints: Record<string, ContentEditCheckpointRecord>;
  upsertProposal: (proposal: ContentEditProposalRecord) => void;
  updateProposal: (
    proposalId: string,
    updater: (current: ContentEditProposalRecord) => ContentEditProposalRecord
  ) => void;
  supersedePendingProposals: (params: {
    conversationKey: string;
    contentId: number;
    excludeProposalId: string;
  }) => void;
  upsertCheckpoint: (checkpoint: ContentEditCheckpointRecord) => void;
  updateCheckpoint: (
    checkpointId: string,
    updater: (current: ContentEditCheckpointRecord) => ContentEditCheckpointRecord
  ) => void;
}

interface CreateProposalParams {
  databaseName?: string;
  signal?: AbortSignal;
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

interface ApplyProposalParams {
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

const STORAGE_KEY = "content-edit-review-session";
const REVIEW_SESSION_STORAGE_KEY = "content-edit-review-tool-session";
const PROPOSAL_CACHE_DIR = "content-edit/proposals";
const CHECKPOINT_CACHE_DIR = "content-edit/checkpoints";
const PREVIEW_TEXT_LIMIT = 140;

const now = () => Date.now();

const clampPreviewText = (value: string) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= PREVIEW_TEXT_LIMIT) {
    return normalized;
  }
  return `${normalized.slice(0, PREVIEW_TEXT_LIMIT - 1)}…`;
};

const createProposalId = () => `proposal_${now()}_${Math.random().toString(36).slice(2, 10)}`;

const createCheckpointId = () => `checkpoint_${now()}_${Math.random().toString(36).slice(2, 10)}`;

const buildProposalFilePath = (proposalId: string) => `${PROPOSAL_CACHE_DIR}/${proposalId}.json`;

const buildCheckpointFilePath = (checkpointId: string) =>
  `${CHECKPOINT_CACHE_DIR}/${checkpointId}.json`;

const buildConversationKey = (
  conversationKey: string | undefined,
  resolvedTarget: ResolvedContentTarget
) => {
  if (conversationKey?.trim()) {
    return conversationKey.trim();
  }
  return `content-edit:${resolvedTarget.contentId}`;
};

const buildDiffSummary = (patches: ContentEditProposalRecord["patches"]) => {
  let insertedChars = 0;
  let deletedChars = 0;

  const accumulatePatchDelta = (patch: ContentEditProposalRecord["patches"][number]) => {
    if (patch.op === "insert") {
      insertedChars += patch.afterText.length;
      return;
    }

    if (patch.op === "delete") {
      deletedChars += patch.beforeText.length;
      return;
    }

    const charDiffs = computeCharDiff(patch.beforeText, patch.afterText);
    charDiffs.forEach(diff => {
      if (diff.type === "insert") {
        insertedChars += diff.text.length;
      } else if (diff.type === "delete") {
        deletedChars += diff.text.length;
      }
    });
  };

  const changePreviews = patches.slice(0, 5).map(patch => {
    accumulatePatchDelta(patch);

    return {
      operationId: patch.operationId,
      op: patch.op,
      beforeTextPreview: clampPreviewText(patch.beforeText),
      afterTextPreview: clampPreviewText(patch.afterText),
      charDelta: patch.charDelta,
    };
  });

  patches.slice(5).forEach(patch => {
    accumulatePatchDelta(patch);
  });

  return {
    patchCount: patches.length,
    insertedChars,
    deletedChars,
    changePreviews,
  };
};

const persistProposalCache = async (
  proposalId: string,
  payload: ContentEditProposalCachePayload
) => {
  const filePath = buildProposalFilePath(proposalId);
  await writeCacheFile(filePath, payload);
  return filePath;
};

const readProposalCache = async (proposalFilePath: string) => {
  return (await readCacheFile(proposalFilePath)) as ContentEditProposalCachePayload | null;
};

const persistCheckpointCache = async (
  checkpointId: string,
  payload: ContentEditCheckpointCachePayload
) => {
  const filePath = buildCheckpointFilePath(checkpointId);
  await writeCacheFile(filePath, payload);
  return filePath;
};

const readCheckpointCache = async (checkpointFilePath: string) => {
  return (await readCacheFile(checkpointFilePath)) as ContentEditCheckpointCachePayload | null;
};

interface PendingReviewResolver {
  resolve: (decision: ContentEditReviewDecision) => void;
  reject: (error: Error) => void;
}

interface ContentEditReviewExecutionLocator {
  toolCallId: string;
  rawInput?: string;
  timestamp?: number;
  conversationKey?: string;
}

interface ContentEditReviewSessionState {
  records: Record<string, ContentEditReviewSessionRecord>;
  createPending: (params: {
    toolCallId: string;
    toolName: string;
    conversationKey: string;
    rawInput: string;
    proposalId: string;
    payload: ContentEditRendererPayload;
  }) => ContentEditReviewSessionRecord;
  registerResolver: (sessionId: string, resolver: PendingReviewResolver) => void;
  submitDecision: (
    sessionId: string,
    decision: ContentEditReviewDecision
  ) => "resolved" | "stored" | "missing";
  submitDecisionByExecution: (
    locator: ContentEditReviewExecutionLocator,
    decision: ContentEditReviewDecision
  ) => "resolved" | "stored" | "missing";
  completeSession: (sessionId: string) => void;
  cancelSession: (sessionId: string, reason?: string) => void;
  findRecordByExecution: (
    locator: ContentEditReviewExecutionLocator
  ) => ContentEditReviewSessionRecord | undefined;
  getRecord: (sessionId: string) => ContentEditReviewSessionRecord | undefined;
  removeRecord: (sessionId: string) => void;
  cleanupStalePendingSessions: () => void;
}

const liveReviewResolvers = new Map<string, PendingReviewResolver>();

const normalizeRawInput = (value: string | undefined) => {
  if (!value) {
    return "";
  }
  try {
    return JSON.stringify(JSON.parse(value));
  } catch {
    return value.trim();
  }
};

const buildReviewSessionId = (params: {
  conversationKey: string;
  toolCallId: string;
  createdAt: number;
}) => `${params.conversationKey}::${params.toolCallId}::${params.createdAt}`;

const reviewStatusPriority: Record<ContentEditReviewSessionStatus, number> = {
  pending: 0,
  submitted: 1,
  completed: 2,
  cancelled: 3,
};

const pickReviewRecordForExecution = (
  records: ContentEditReviewSessionRecord[],
  locator: ContentEditReviewExecutionLocator,
  options?: { pendingOnly?: boolean }
) => {
  const filteredByToolCall = records.filter(record => record.toolCallId === locator.toolCallId);
  if (filteredByToolCall.length === 0) {
    return undefined;
  }

  const filteredByConversation = locator.conversationKey
    ? filteredByToolCall.filter(record => record.conversationKey === locator.conversationKey)
    : filteredByToolCall;
  const candidates =
    filteredByConversation.length > 0 ? filteredByConversation : filteredByToolCall;
  const locatorRawInput = normalizeRawInput(locator.rawInput);

  const ranked = [...candidates].sort((a, b) => {
    if (options?.pendingOnly) {
      const pendingDiff = Number(a.status === "pending") - Number(b.status === "pending");
      if (pendingDiff !== 0) {
        return -pendingDiff;
      }
    }

    const aInputMatch =
      locatorRawInput.length > 0 && normalizeRawInput(a.rawInput) === locatorRawInput;
    const bInputMatch =
      locatorRawInput.length > 0 && normalizeRawInput(b.rawInput) === locatorRawInput;
    if (aInputMatch !== bInputMatch) {
      return aInputMatch ? -1 : 1;
    }

    const aStatusRank = reviewStatusPriority[a.status] ?? 99;
    const bStatusRank = reviewStatusPriority[b.status] ?? 99;
    if (aStatusRank !== bStatusRank) {
      return aStatusRank - bStatusRank;
    }

    if (typeof locator.timestamp === "number") {
      const aDistance = Math.abs(a.createdAt - locator.timestamp);
      const bDistance = Math.abs(b.createdAt - locator.timestamp);
      if (aDistance !== bDistance) {
        return aDistance - bDistance;
      }
    }

    if (a.updatedAt !== b.updatedAt) {
      return b.updatedAt - a.updatedAt;
    }
    return b.createdAt - a.createdAt;
  });

  const matched = ranked[0];
  if (options?.pendingOnly && matched?.status !== "pending") {
    return undefined;
  }
  return matched;
};

/**
 * 检查指定对话是否有 pending 状态的审阅会话（且 resolver 仍然存活）
 */
export const hasPendingReviewSession = (conversationKey: string): boolean => {
  const records = Object.values(useContentEditReviewSessionStore.getState().records);
  return records.some(
    record =>
      record.conversationKey === conversationKey &&
      record.status === "pending" &&
      liveReviewResolvers.has(record.sessionId)
  );
};

/** 这次提案的工具调用是否还在本窗口等待逐条结果（在等就不必另发消息，意见会随结果交给 Agent） */
export const hasLiveSuggestionReview = (proposalId: string): boolean =>
  Object.values(useContentEditReviewSessionStore.getState().records).some(
    record =>
      record.proposalId === proposalId &&
      record.status === "pending" &&
      liveReviewResolvers.has(record.sessionId)
  );

export const useContentEditReviewSessionStore = create<ContentEditReviewSessionState>()(
  persist(
    (set, get) => ({
      records: {},
      createPending: params => {
        const createdAt = now();
        const record: ContentEditReviewSessionRecord = {
          sessionId: buildReviewSessionId({
            conversationKey: params.conversationKey,
            toolCallId: params.toolCallId,
            createdAt,
          }),
          toolCallId: params.toolCallId,
          toolName: params.toolName,
          conversationKey: params.conversationKey,
          rawInput: params.rawInput,
          proposalId: params.proposalId,
          payload: params.payload,
          status: "pending",
          createdAt,
          updatedAt: createdAt,
        };
        set(state => ({
          records: {
            ...state.records,
            [record.sessionId]: record,
          },
        }));
        return record;
      },
      registerResolver: (sessionId, resolver) => {
        liveReviewResolvers.set(sessionId, resolver);
      },
      submitDecision: (sessionId, decision) => {
        const record = get().records[sessionId];
        if (!record) {
          return "missing";
        }
        const updatedRecord: ContentEditReviewSessionRecord = {
          ...record,
          status: "submitted",
          decision,
          updatedAt: now(),
        };
        set(state => ({
          records: {
            ...state.records,
            [sessionId]: updatedRecord,
          },
        }));
        const resolver = liveReviewResolvers.get(sessionId);
        if (!resolver) {
          return "stored";
        }
        liveReviewResolvers.delete(sessionId);
        resolver.resolve(decision);
        return "resolved";
      },
      submitDecisionByExecution: (locator, decision) => {
        const record = pickReviewRecordForExecution(Object.values(get().records), locator, {
          pendingOnly: true,
        });
        if (!record) {
          return "missing";
        }
        return get().submitDecision(record.sessionId, decision);
      },
      completeSession: sessionId => {
        liveReviewResolvers.delete(sessionId);
        const record = get().records[sessionId];
        if (!record) {
          return;
        }
        const completedAt = now();
        set(state => ({
          records: {
            ...state.records,
            [sessionId]: {
              ...record,
              status: "completed",
              updatedAt: completedAt,
              completedAt,
            },
          },
        }));
      },
      cancelSession: (sessionId, reason) => {
        const resolver = liveReviewResolvers.get(sessionId);
        if (resolver) {
          liveReviewResolvers.delete(sessionId);
          resolver.reject(new Error(reason || "内容审阅会话已取消"));
        }
        const record = get().records[sessionId];
        if (!record) {
          return;
        }
        set(state => ({
          records: {
            ...state.records,
            [sessionId]: {
              ...record,
              status: "cancelled",
              cancelReason: reason,
              updatedAt: now(),
            },
          },
        }));
      },
      findRecordByExecution: locator =>
        pickReviewRecordForExecution(Object.values(get().records), locator),
      getRecord: sessionId => get().records[sessionId],
      removeRecord: sessionId => {
        liveReviewResolvers.delete(sessionId);
        set(state => {
          const next = { ...state.records };
          delete next[sessionId];
          return { records: next };
        });
      },
      cleanupStalePendingSessions: () => {
        const records = get().records;
        const staleSessionIds: string[] = [];
        const orphaned: string[] = [];
        const proposals = useContentEditReviewStore.getState().proposals;

        // 刷新后 resolver 已丢失：逐条建议的条目仍在主进程，可在对话卡片与正文里继续处理，
        // 保留记录（转为已取消）让卡片还能找到提案；整篇提案无法再确认，直接清掉
        for (const [sessionId, record] of Object.entries(records)) {
          if (record.status !== "pending") continue;
          if (proposals[record.proposalId]?.suggestions) orphaned.push(sessionId);
          else staleSessionIds.push(sessionId);
        }

        if (staleSessionIds.length > 0 || orphaned.length > 0) {
          console.log("[cleanupStalePendingSessions] 清理过期的 pending 会话:", staleSessionIds);
          set(state => {
            const next = { ...state.records };
            for (const sessionId of staleSessionIds) {
              delete next[sessionId];
            }
            for (const sessionId of orphaned) {
              next[sessionId] = {
                ...next[sessionId],
                status: "cancelled",
                cancelReason: "对话已重新载入",
                updatedAt: now(),
              };
            }
            return { records: next };
          });
        }
      },
    }),
    {
      name: REVIEW_SESSION_STORAGE_KEY,
      version: 1,
      partialize: state => ({
        records: state.records,
      }),
    }
  )
);

export const useContentEditReviewStore = create<ContentEditReviewState>()(
  persist(
    (set, get) => ({
      proposals: {},
      checkpoints: {},
      upsertProposal: proposal => {
        set(state => ({
          proposals: {
            ...state.proposals,
            [proposal.proposalId]: proposal,
          },
        }));
      },
      updateProposal: (proposalId, updater) => {
        const current = get().proposals[proposalId];
        if (!current) return;
        const next = updater(current);
        set(state => ({
          proposals: {
            ...state.proposals,
            [proposalId]: next,
          },
        }));
      },
      supersedePendingProposals: ({ conversationKey, contentId, excludeProposalId }) => {
        const proposals = get().proposals;
        const nextProposals = { ...proposals };
        let changed = false;
        Object.values(proposals).forEach(proposal => {
          if (
            proposal.proposalId !== excludeProposalId &&
            proposal.conversationKey === conversationKey &&
            proposal.contentId === contentId &&
            proposal.status === "pending_review"
          ) {
            nextProposals[proposal.proposalId] = {
              ...proposal,
              status: "superseded",
              updatedAt: now(),
            };
            changed = true;
          }
        });
        if (!changed) return;
        set(() => ({
          proposals: nextProposals,
        }));
      },
      upsertCheckpoint: checkpoint => {
        set(state => ({
          checkpoints: {
            ...state.checkpoints,
            [checkpoint.checkpointId]: checkpoint,
          },
        }));
      },
      updateCheckpoint: (checkpointId, updater) => {
        const current = get().checkpoints[checkpointId];
        if (!current) return;
        const next = updater(current);
        set(state => ({
          checkpoints: {
            ...state.checkpoints,
            [checkpointId]: next,
          },
        }));
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
    }
  )
);

const stringifySafe = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

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

/** 工具权限模式为「自动允许编辑 / 跳过确认」时：不弹审阅卡，直接应用并返回同构结果（D-060） */
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

export const getContentEditReviewSessionStore = () => useContentEditReviewSessionStore.getState();

const updateSessionContentIfNeeded = (contentId: number, content: ContentSnapshot["content"]) => {
  const session = getActiveEditingSessionByContentId(contentId);
  if (!session) return;
  updateActiveEditingSessionContent(session.id, content);
};

const buildRendererPayload = (payload: {
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

const createReviewToolResult = (payload: {
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

export const getContentEditProposal = (proposalId: string) =>
  useContentEditReviewStore.getState().proposals[proposalId];

export const getContentEditCheckpoint = (checkpointId: string) =>
  useContentEditReviewStore.getState().checkpoints[checkpointId];

export const createContentEditProposal = async (params: CreateProposalParams) => {
  params = { ...params, databaseName: params.databaseName ?? getChatDatabase() };
  const wholeDocument = params.operations.some(
    operation => operation.op !== "insert" && operation.locator.kind === "full-document"
  );
  if (wholeDocument && params.operations.length !== 1) throw new Error("全文替换必须单独提交");
  const scoped = isElectron && !wholeDocument;
  const match = params.operations.find(operation => operation.locator.kind === "match-id")?.locator;
  const snapshotId =
    params.snapshotId ??
    (match?.kind === "match-id" ? getRangeByMatchId(match.matchId)?.snapshotId : undefined);
  const captured = snapshotId ? getSnapshot(snapshotId) : null;
  const state = captured?.editState;
  const databaseName = (params.databaseName ?? "").replace(/\.db$/, "");
  const resolvedTarget = await resolveContentTarget(
    {
      contentId:
        params.target?.contentId ??
        (state?.databaseName === databaseName ? state?.contentId : undefined),
    },
    params
  );
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
      proposal.contentId === resolvedTarget.contentId &&
      proposal.commitPending
  );
  if (unsettled)
    return {
      success: false as const,
      errorCode: "COMMIT_PENDING",
      message: "请先用 resumeProposalId 确认原提交",
      proposalId: unsettled.proposalId,
    };
  if (
    isElectron &&
    !snapshotId &&
    (wholeDocument ||
      params.operations.some(
        operation =>
          operation.locator.kind === "markdown-range" || operation.locator.kind === "slate-path"
      ))
  ) {
    return {
      success: false as const,
      errorCode: "SNAPSHOT_REQUIRED",
      message: "请先读取正文并传入 snapshotId",
    };
  }
  if (
    snapshotId &&
    isElectron &&
    (!state || state.contentId !== resolvedTarget.contentId || state.databaseName !== databaseName)
  ) {
    return {
      success: false as const,
      errorCode: "SNAPSHOT_EXPIRED",
      message: "正文快照已失效，请重新读取",
    };
  }
  const { snapshot, source } =
    captured && state
      ? { snapshot: captured, source: captured.source }
      : await (scoped
          ? loadSnapshotForContent(resolvedTarget.contentId, params, true)
          : loadSnapshotForContent(resolvedTarget.contentId, params));
  const selection = snapshot.editState
    ? (snapshot.editState.selection ?? null)
    : params.databaseName === getChatDatabase()
      ? getActiveEditingSessionByContentId(resolvedTarget.contentId)?.selection || null
      : null;

  if (params.baseHash && params.baseHash !== snapshot.hash) {
    return {
      success: false as const,
      errorCode: "CONTENT_CONFLICT",
      message: "内容已变化，请先刷新上下文后重试",
      currentHash: snapshot.hash,
      requestedHash: params.baseHash,
      snapshotId: snapshot.id,
    };
  }

  const editResult = applyEditOperations({
    snapshot,
    operations: params.operations,
    selection,
  });

  const proposalId = createProposalId();
  const scopedPlan =
    scoped && snapshot.editState
      ? await compileScopedPlan(snapshot, editResult.patches, params.operations)
      : undefined;
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
    diffSummary: buildDiffSummary(editResult.patches),
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
      items: scopedPlan.edits.map((edit, index) => ({
        edit,
        beforeText: editResult.patches[index]?.beforeText ?? "",
        afterText: editResult.patches[index]?.afterText ?? "",
        ...(reasons.get(edit.id) ? { reason: reasons.get(edit.id) } : {}),
      })),
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

/** 接受选中的条目（缺省全部待处理）；已被另一视图处理的条目原样返回其结果。 */
const acceptSuggestions = async (
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
  if (accept.length && !items.some(item => item.status === "accepted"))
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
const awaitSuggestionDecisions = (params: {
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
          .filter(item => item.status === "rejected" && item.feedback)
          .map(item => item.feedback!)
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
  if (pending.length)
    await commands.acceptContentSuggestions(proposal.contentId, pending, {
      typing: true,
      executionId,
      requireDirectPermission,
    });
  const items = await commands.listContentSuggestions({ proposalId: proposal.proposalId });
  const summary = summarizeSuggestionProposal(proposal, items);
  return createReviewToolResult({
    action: items.some(item => item.status === "accepted") ? "applied" : "rejected",
    proposal: getContentEditProposal(proposal.proposalId) ?? proposal,
    items: summary.items,
    direct: true,
  });
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
    const applied = getContentEditProposal(proposal.proposalId)!;
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
    const conflicted = getContentEditProposal(proposal.proposalId)!;
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

  const applied = getContentEditProposal(proposal.proposalId)!;
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

  const updated = getContentEditProposal(proposal.proposalId)!;
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
