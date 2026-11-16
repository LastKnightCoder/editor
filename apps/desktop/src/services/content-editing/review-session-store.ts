import { create } from "zustand";
import { persist } from "zustand/middleware";
import { now } from "./review-session-helpers";
import { useContentEditReviewStore } from "./proposal-store";
import type {
  ContentEditRendererPayload,
  ContentEditReviewDecision,
  ContentEditReviewSessionRecord,
  ContentEditReviewSessionStatus,
} from "./types";

interface PendingReviewResolver {
  resolve: (decision: ContentEditReviewDecision) => void;
  reject: (error: Error) => void;
}

export interface ContentEditReviewExecutionLocator {
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

const REVIEW_SESSION_STORAGE_KEY = "content-edit-review-tool-session";

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

export const getContentEditReviewSessionStore = () => useContentEditReviewSessionStore.getState();
