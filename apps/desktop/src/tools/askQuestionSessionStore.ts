import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createAbortError } from "@tau/agent";
import type {
  AskQuestionPayload,
  AskQuestionSessionRecord,
  AskQuestionSessionStatus,
  AskQuestionSubmission,
} from "./askQuestionTypes";

interface PendingResolver {
  resolve: (submission: AskQuestionSubmission) => void;
  reject: (error: Error) => void;
}

const liveResolvers = new Map<string, PendingResolver>();

interface AskQuestionExecutionLocator {
  toolCallId: string;
  rawInput?: string;
  timestamp?: number;
  conversationKey?: string;
}

interface AskQuestionSessionState {
  records: Record<string, AskQuestionSessionRecord>;
  createPending: (params: {
    toolCallId: string;
    toolName: string;
    conversationKey: string;
    rawInput: string;
    payload: AskQuestionPayload;
  }) => AskQuestionSessionRecord;
  registerResolver: (sessionId: string, resolver: PendingResolver) => void;
  submitAnswers: (
    sessionId: string,
    submission: AskQuestionSubmission,
  ) => "resolved" | "stored" | "missing";
  submitAnswersByExecution: (
    locator: AskQuestionExecutionLocator,
    submission: AskQuestionSubmission,
  ) => "resolved" | "stored" | "missing";
  completeSession: (sessionId: string) => void;
  cancelSession: (sessionId: string, reason?: string) => void;
  getSubmittedSessionsByConversation: (
    conversationKey: string,
  ) => AskQuestionSessionRecord[];
  findRecordByExecution: (
    locator: AskQuestionExecutionLocator,
  ) => AskQuestionSessionRecord | undefined;
  getRecord: (sessionId: string) => AskQuestionSessionRecord | undefined;
  removeRecord: (sessionId: string) => void;
}

const now = () => Date.now();

const sortByUpdatedAt = (records: AskQuestionSessionRecord[]) =>
  records.sort((a, b) => a.updatedAt - b.updatedAt);

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

const statusPriorityByDefault: Record<AskQuestionSessionStatus, number> = {
  pending: 0,
  submitted: 1,
  completed: 2,
  cancelled: 3,
};

const statusPriorityPendingFirst: Record<AskQuestionSessionStatus, number> = {
  pending: 0,
  submitted: 1,
  completed: 2,
  cancelled: 3,
};

const buildSessionId = (params: {
  conversationKey: string;
  toolCallId: string;
  createdAt: number;
}) => `${params.conversationKey}::${params.toolCallId}::${params.createdAt}`;

const pickRecordForExecution = (
  records: AskQuestionSessionRecord[],
  locator: AskQuestionExecutionLocator,
  options?: { pendingOnly?: boolean },
) => {
  const filteredByToolCall = records.filter(
    (record) => record.toolCallId === locator.toolCallId,
  );
  if (filteredByToolCall.length === 0) {
    return undefined;
  }

  const filteredByConversation = locator.conversationKey
    ? filteredByToolCall.filter(
        (record) => record.conversationKey === locator.conversationKey,
      )
    : filteredByToolCall;
  const candidates =
    filteredByConversation.length > 0
      ? filteredByConversation
      : filteredByToolCall;

  const locatorRawInput = normalizeRawInput(locator.rawInput);
  const priorityMap = options?.pendingOnly
    ? statusPriorityPendingFirst
    : statusPriorityByDefault;

  const ranked = [...candidates].sort((a, b) => {
    if (options?.pendingOnly) {
      const pendingDiff =
        Number(a.status === "pending") - Number(b.status === "pending");
      if (pendingDiff !== 0) {
        return -pendingDiff;
      }
    }

    const aInputMatch =
      locatorRawInput.length > 0 &&
      normalizeRawInput(a.rawInput) === locatorRawInput;
    const bInputMatch =
      locatorRawInput.length > 0 &&
      normalizeRawInput(b.rawInput) === locatorRawInput;
    if (aInputMatch !== bInputMatch) {
      return aInputMatch ? -1 : 1;
    }

    const aStatusRank = priorityMap[a.status] ?? 99;
    const bStatusRank = priorityMap[b.status] ?? 99;
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

const migrateRecords = (
  records: Record<string, AskQuestionSessionRecord | Record<string, unknown>>,
) => {
  const migratedRecords: Record<string, AskQuestionSessionRecord> = {};

  Object.entries(records).forEach(([legacyKey, value], index) => {
    if (!value || typeof value !== "object") {
      return;
    }

    const record = value as Partial<AskQuestionSessionRecord>;
    const createdAt =
      typeof record.createdAt === "number" ? record.createdAt : now() + index;
    const toolCallId = record.toolCallId || legacyKey;
    const conversationKey = record.conversationKey || "default";
    const sessionId =
      record.sessionId ||
      buildSessionId({
        conversationKey,
        toolCallId,
        createdAt,
      });

    const normalizedRecord: AskQuestionSessionRecord = {
      sessionId,
      toolCallId,
      toolName: record.toolName || "ask-question",
      conversationKey,
      rawInput:
        typeof record.rawInput === "string"
          ? record.rawInput
          : JSON.stringify(record.rawInput ?? {}),
      payload:
        record.payload && typeof record.payload === "object"
          ? (record.payload as AskQuestionPayload)
          : ({ questions: [] } as AskQuestionPayload),
      status: record.status || "pending",
      submittedAnswers: record.submittedAnswers,
      createdAt,
      updatedAt:
        typeof record.updatedAt === "number" ? record.updatedAt : createdAt,
      completedAt: record.completedAt,
      cancelReason: record.cancelReason,
    };

    migratedRecords[normalizedRecord.sessionId] = normalizedRecord;
  });

  return migratedRecords;
};

export const useAskQuestionSessionStore = create<AskQuestionSessionState>()(
  persist(
    (set, get) => ({
      records: {},
      createPending: (params) => {
        const timestamp = now();
        const record: AskQuestionSessionRecord = {
          sessionId: buildSessionId({
            conversationKey: params.conversationKey,
            toolCallId: params.toolCallId,
            createdAt: timestamp,
          }),
          toolCallId: params.toolCallId,
          toolName: params.toolName,
          conversationKey: params.conversationKey,
          rawInput: params.rawInput,
          payload: params.payload,
          status: "pending",
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        set((state) => ({
          records: {
            ...state.records,
            [record.sessionId]: record,
          },
        }));

        return record;
      },
      registerResolver: (sessionId, resolver) => {
        liveResolvers.set(sessionId, resolver);
      },
      submitAnswers: (sessionId, submission) => {
        const record = get().records[sessionId];
        if (!record) {
          return "missing";
        }

        const updatedRecord: AskQuestionSessionRecord = {
          ...record,
          status: "submitted",
          submittedAnswers: submission,
          updatedAt: now(),
        };

        set((state) => ({
          records: {
            ...state.records,
            [sessionId]: updatedRecord,
          },
        }));

        const resolver = liveResolvers.get(sessionId);
        if (!resolver) {
          return "stored";
        }

        liveResolvers.delete(sessionId);
        resolver.resolve(submission);
        return "resolved";
      },
      submitAnswersByExecution: (locator, submission) => {
        const record = pickRecordForExecution(
          Object.values(get().records),
          locator,
          {
            pendingOnly: true,
          },
        );
        if (!record) {
          return "missing";
        }
        return get().submitAnswers(record.sessionId, submission);
      },
      completeSession: (sessionId) => {
        liveResolvers.delete(sessionId);
        const record = get().records[sessionId];
        if (!record) {
          return;
        }

        const completedAt = now();
        set((state) => ({
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
        const resolver = liveResolvers.get(sessionId);
        if (resolver) {
          liveResolvers.delete(sessionId);
          resolver.reject(createAbortError(reason || "ask-question 已取消"));
        }

        const record = get().records[sessionId];
        if (!record) {
          return;
        }

        set((state) => ({
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
      getSubmittedSessionsByConversation: (conversationKey) => {
        const records = Object.values(get().records).filter(
          (record) =>
            record.conversationKey === conversationKey &&
            record.status === "submitted" &&
            Boolean(record.submittedAnswers),
        );
        return sortByUpdatedAt(records);
      },
      findRecordByExecution: (locator) =>
        pickRecordForExecution(Object.values(get().records), locator),
      getRecord: (sessionId) => get().records[sessionId],
      removeRecord: (sessionId) => {
        liveResolvers.delete(sessionId);
        set((state) => {
          const next = { ...state.records };
          delete next[sessionId];
          return { records: next };
        });
      },
    }),
    {
      name: "ask-question-session",
      version: 2,
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== "object") {
          return { records: {} };
        }
        const state = persistedState as {
          records?: Record<
            string,
            AskQuestionSessionRecord | Record<string, unknown>
          >;
        };
        return {
          ...state,
          records: migrateRecords(state.records || {}),
        };
      },
      partialize: (state) => ({
        records: state.records,
      }),
    },
  ),
);

export const getAskQuestionSessionStore = () =>
  useAskQuestionSessionStore.getState();
