import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  writeCacheFile,
  readCacheFile,
  cacheFileExists,
} from "@/commands/cache";
import type {
  ToolExecutionContext,
  ToolExecutionMetadata,
  ToolExecutionResult,
} from "@/types";
import {
  getActiveEditingSessionByContentId,
  updateActiveEditingSessionContent,
} from "./active-editor-session";
import { applyEditOperations } from "./edit-engine";
import { persistContentFromMarkdown, persistContentValue } from "./persist";
import { loadSnapshotForContent, resolveContentTarget } from "./resolver";
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
  ContentWritePermission,
  EditOperation,
  ResolvedContentTarget,
} from "./types";

interface ContentEditReviewState {
  proposals: Record<string, ContentEditProposalRecord>;
  checkpoints: Record<string, ContentEditCheckpointRecord>;
  permissions: Record<string, ContentWritePermission>;
  upsertProposal: (proposal: ContentEditProposalRecord) => void;
  updateProposal: (
    proposalId: string,
    updater: (current: ContentEditProposalRecord) => ContentEditProposalRecord,
  ) => void;
  supersedePendingProposals: (params: {
    conversationKey: string;
    contentId: number;
    excludeProposalId: string;
  }) => void;
  upsertCheckpoint: (checkpoint: ContentEditCheckpointRecord) => void;
  updateCheckpoint: (
    checkpointId: string,
    updater: (
      current: ContentEditCheckpointRecord,
    ) => ContentEditCheckpointRecord,
  ) => void;
  setPermission: (
    conversationKey: string,
    permission: ContentWritePermission,
  ) => void;
}

interface CreateProposalParams {
  target?: { contentId?: number };
  baseHash?: string;
  operations: EditOperation[];
  sourceToolName: string;
  conversationKey?: string;
}

interface ApplyProposalParams {
  proposalId: string;
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
const DEFAULT_PERMISSION: ContentWritePermission = "review_required";
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

const createProposalId = () =>
  `proposal_${now()}_${Math.random().toString(36).slice(2, 10)}`;

const createCheckpointId = () =>
  `checkpoint_${now()}_${Math.random().toString(36).slice(2, 10)}`;

const buildProposalFilePath = (proposalId: string) =>
  `${PROPOSAL_CACHE_DIR}/${proposalId}.json`;

const buildCheckpointFilePath = (checkpointId: string) =>
  `${CHECKPOINT_CACHE_DIR}/${checkpointId}.json`;

const buildConversationKey = (
  conversationKey: string | undefined,
  resolvedTarget: ResolvedContentTarget,
) => {
  if (conversationKey?.trim()) {
    return conversationKey.trim();
  }
  return `content-edit:${resolvedTarget.contentId}`;
};

const buildDiffSummary = (patches: ContentEditProposalRecord["patches"]) => {
  let insertedChars = 0;
  let deletedChars = 0;

  const changePreviews = patches.slice(0, 5).map((patch) => {
    const beforeLength = patch.beforeText.length;
    const afterLength = patch.afterText.length;
    if (afterLength > beforeLength) {
      insertedChars += afterLength - beforeLength;
    } else if (beforeLength > afterLength) {
      deletedChars += beforeLength - afterLength;
    }

    return {
      operationId: patch.operationId,
      op: patch.op,
      beforeTextPreview: clampPreviewText(patch.beforeText),
      afterTextPreview: clampPreviewText(patch.afterText),
      charDelta: patch.charDelta,
    };
  });

  patches.slice(5).forEach((patch) => {
    const beforeLength = patch.beforeText.length;
    const afterLength = patch.afterText.length;
    if (afterLength > beforeLength) {
      insertedChars += afterLength - beforeLength;
    } else if (beforeLength > afterLength) {
      deletedChars += beforeLength - afterLength;
    }
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
  payload: ContentEditProposalCachePayload,
) => {
  const filePath = buildProposalFilePath(proposalId);
  await writeCacheFile(filePath, payload);
  return filePath;
};

const readProposalCache = async (proposalFilePath: string) => {
  return (await readCacheFile(
    proposalFilePath,
  )) as ContentEditProposalCachePayload | null;
};

const persistCheckpointCache = async (
  checkpointId: string,
  payload: ContentEditCheckpointCachePayload,
) => {
  const filePath = buildCheckpointFilePath(checkpointId);
  await writeCacheFile(filePath, payload);
  return filePath;
};

const readCheckpointCache = async (checkpointFilePath: string) => {
  return (await readCacheFile(
    checkpointFilePath,
  )) as ContentEditCheckpointCachePayload | null;
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
  registerResolver: (
    sessionId: string,
    resolver: PendingReviewResolver,
  ) => void;
  submitDecision: (
    sessionId: string,
    decision: ContentEditReviewDecision,
  ) => "resolved" | "stored" | "missing";
  submitDecisionByExecution: (
    locator: ContentEditReviewExecutionLocator,
    decision: ContentEditReviewDecision,
  ) => "resolved" | "stored" | "missing";
  completeSession: (sessionId: string) => void;
  cancelSession: (sessionId: string, reason?: string) => void;
  findRecordByExecution: (
    locator: ContentEditReviewExecutionLocator,
  ) => ContentEditReviewSessionRecord | undefined;
  getRecord: (sessionId: string) => ContentEditReviewSessionRecord | undefined;
  removeRecord: (sessionId: string) => void;
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

export const useContentEditReviewSessionStore =
  create<ContentEditReviewSessionState>()(
    persist(
      (set, get) => ({
        records: {},
        createPending: (params) => {
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
          set((state) => ({
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
          set((state) => ({
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
          const record = pickReviewRecordForExecution(
            Object.values(get().records),
            locator,
            { pendingOnly: true },
          );
          if (!record) {
            return "missing";
          }
          return get().submitDecision(record.sessionId, decision);
        },
        completeSession: (sessionId) => {
          liveReviewResolvers.delete(sessionId);
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
          const resolver = liveReviewResolvers.get(sessionId);
          if (resolver) {
            liveReviewResolvers.delete(sessionId);
            resolver.reject(new Error(reason || "内容审阅会话已取消"));
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
        findRecordByExecution: (locator) =>
          pickReviewRecordForExecution(Object.values(get().records), locator),
        getRecord: (sessionId) => get().records[sessionId],
        removeRecord: (sessionId) => {
          liveReviewResolvers.delete(sessionId);
          set((state) => {
            const next = { ...state.records };
            delete next[sessionId];
            return { records: next };
          });
        },
      }),
      {
        name: REVIEW_SESSION_STORAGE_KEY,
        version: 1,
        partialize: (state) => ({
          records: state.records,
        }),
      },
    ),
  );

export const useContentEditReviewStore = create<ContentEditReviewState>()(
  persist(
    (set, get) => ({
      proposals: {},
      checkpoints: {},
      permissions: {},
      upsertProposal: (proposal) => {
        set((state) => ({
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
        set((state) => ({
          proposals: {
            ...state.proposals,
            [proposalId]: next,
          },
        }));
      },
      supersedePendingProposals: ({
        conversationKey,
        contentId,
        excludeProposalId,
      }) => {
        const proposals = get().proposals;
        const nextProposals = { ...proposals };
        let changed = false;
        Object.values(proposals).forEach((proposal) => {
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
      upsertCheckpoint: (checkpoint) => {
        set((state) => ({
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
        set((state) => ({
          checkpoints: {
            ...state.checkpoints,
            [checkpointId]: next,
          },
        }));
      },
      setPermission: (conversationKey, permission) => {
        set((state) => ({
          permissions: {
            ...state.permissions,
            [conversationKey]: permission,
          },
        }));
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
    },
  ),
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
  const proposalCache = await readProposalCache(
    params.proposal.proposalFilePath,
  );
  const proposedMarkdown = proposalCache?.markdown;
  const payload = buildRendererPayload({
    proposal: params.proposal,
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

  if (params.context.signal?.aborted) {
    useContentEditReviewSessionStore
      .getState()
      .cancelSession(session.sessionId, "内容审阅会话已中止");
    throw new Error("内容审阅会话已中止");
  }

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

    useContentEditReviewSessionStore
      .getState()
      .registerResolver(session.sessionId, {
        resolve: async (decision) => {
          clearAbort();
          try {
            if (decision.action === "apply") {
              const applyResult = await applyContentEditProposal({
                proposalId: params.proposal.proposalId,
              });
              if (!applyResult.success) {
                throw new Error(applyResult.message || "应用提案失败");
              }
              useContentEditReviewSessionStore
                .getState()
                .completeSession(session.sessionId);
              resolve(
                createReviewToolResult({
                  action: "applied",
                  proposal: applyResult.proposal,
                  proposedMarkdown,
                }),
              );
              return;
            }

            if (decision.action === "feedback") {
              const rejectResult = await rejectContentEditProposal({
                proposalId: params.proposal.proposalId,
                feedback: decision.feedback,
              });
              if (!rejectResult.success) {
                throw new Error(rejectResult.message || "提交修改意见失败");
              }
              useContentEditReviewSessionStore
                .getState()
                .completeSession(session.sessionId);
              resolve(
                createReviewToolResult({
                  action: "feedback",
                  proposal: rejectResult.proposal,
                  proposedMarkdown,
                  feedback: decision.feedback,
                }),
              );
              return;
            }

            const rejectResult = await rejectContentEditProposal({
              proposalId: params.proposal.proposalId,
            });
            if (!rejectResult.success) {
              throw new Error(rejectResult.message || "拒绝提案失败");
            }
            useContentEditReviewSessionStore
              .getState()
              .completeSession(session.sessionId);
            resolve(
              createReviewToolResult({
                action: "rejected",
                proposal: rejectResult.proposal,
                proposedMarkdown,
              }),
            );
          } catch (error) {
            useContentEditReviewSessionStore
              .getState()
              .cancelSession(
                session.sessionId,
                (error as Error).message || "内容审阅执行失败",
              );
            reject(error as Error);
          }
        },
        reject: (error) => {
          clearAbort();
          reject(error);
        },
      });
  });
};

export const submitContentEditReviewDecisionByExecution = (
  locator: ContentEditReviewExecutionLocator,
  decision: ContentEditReviewDecision,
) =>
  useContentEditReviewSessionStore
    .getState()
    .submitDecisionByExecution(locator, decision);

export const getContentEditReviewSessionStore = () =>
  useContentEditReviewSessionStore.getState();

export const getConversationContentWritePermission = (
  conversationKey?: string,
): ContentWritePermission => {
  if (!conversationKey?.trim()) {
    return DEFAULT_PERMISSION;
  }
  return (
    useContentEditReviewStore.getState().permissions[conversationKey.trim()] ||
    DEFAULT_PERMISSION
  );
};

export const setConversationContentWritePermission = (params: {
  conversationKey: string;
  permission: ContentWritePermission;
}) => {
  useContentEditReviewStore
    .getState()
    .setPermission(params.conversationKey, params.permission);
  return getConversationContentWritePermission(params.conversationKey);
};

export const shouldAutoApplyContentProposal = (params: {
  conversationKey: string;
  toolContext?: ToolExecutionMetadata;
}) => {
  const permission = getConversationContentWritePermission(
    params.conversationKey,
  );
  const forceReview = params.toolContext?.flags?.forceReview === true;
  return permission === "auto_apply_allowed" && !forceReview;
};

const updateSessionContentIfNeeded = (
  contentId: number,
  content: ContentSnapshot["content"],
) => {
  const session = getActiveEditingSessionByContentId(contentId);
  if (!session) return;
  updateActiveEditingSessionContent(session.id, content);
};

const buildRendererPayload = (payload: {
  proposal: ContentEditProposalRecord;
  proposedMarkdown?: string;
  matched?: ContentEditRendererPayload["matched"];
}) => {
  const { proposal, proposedMarkdown, matched } = payload;
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
    currentPermission: getConversationContentWritePermission(
      proposal.conversationKey,
    ),
    targetSource: proposal.targetSource,
    lastError: proposal.lastError,
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
    proposedMarkdown,
    matched,
  } satisfies ContentEditRendererPayload;
};

const createReviewToolResult = (payload: {
  action: ContentEditReviewToolResult["action"];
  proposal: ContentEditProposalRecord;
  proposedMarkdown?: string;
  feedback?: string;
}): ToolExecutionResult => {
  const result: ContentEditReviewToolResult = {
    type: "content-edit-review-result",
    action: payload.action,
    submittedAt: now(),
    contentId: payload.proposal.contentId,
    proposalId: payload.proposal.proposalId,
    conversationKey: payload.proposal.conversationKey,
    checkpointId: payload.proposal.checkpointId,
    message:
      payload.action === "applied"
        ? "用户已确认应用修改"
        : payload.action === "feedback"
          ? "用户未确认当前修改，并给出了新的修改意见"
          : "用户拒绝了当前修改",
    ...(payload.feedback ? { feedback: payload.feedback } : {}),
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

export const createContentEditProposal = async (
  params: CreateProposalParams,
) => {
  const resolvedTarget = await resolveContentTarget({
    contentId: params.target?.contentId,
  });
  const { snapshot, source } = await loadSnapshotForContent(
    resolvedTarget.contentId,
  );
  const selection =
    getActiveEditingSessionByContentId(resolvedTarget.contentId)?.selection ||
    null;

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
  const conversationKey = buildConversationKey(
    params.conversationKey,
    resolvedTarget,
  );
  const proposalFilePath = await persistProposalCache(proposalId, {
    markdown: editResult.markdown,
  });
  const timestamp = now();

  useContentEditReviewStore.getState().supersedePendingProposals({
    conversationKey,
    contentId: resolvedTarget.contentId,
    excludeProposalId: proposalId,
  });

  const proposal: ContentEditProposalRecord = {
    proposalId,
    conversationKey,
    contentId: resolvedTarget.contentId,
    sourceToolName: params.sourceToolName,
    status: "pending_review",
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
  };

  useContentEditReviewStore.getState().upsertProposal(proposal);

  return {
    success: true as const,
    proposal,
    rendererPayload: buildRendererPayload({ proposal }),
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
  if (!cachePayload?.markdown) {
    useContentEditReviewStore
      .getState()
      .updateProposal(proposal.proposalId, (current) => ({
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

  const { snapshot } = await loadSnapshotForContent(proposal.contentId);
  if (snapshot.hash !== proposal.beforeHash) {
    useContentEditReviewStore
      .getState()
      .updateProposal(proposal.proposalId, (current) => ({
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
    contentId: proposal.contentId,
    markdown: cachePayload.markdown,
    sourceUuid: `content-edit-proposal:${proposal.proposalId}`,
  });
  updateSessionContentIfNeeded(proposal.contentId, persisted.content);

  useContentEditReviewStore
    .getState()
    .updateProposal(proposal.proposalId, (current) => ({
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

export const rejectContentEditProposal = async (
  params: RejectProposalParams,
) => {
  const proposal = getContentEditProposal(params.proposalId);
  if (!proposal) {
    return {
      success: false as const,
      errorCode: "PROPOSAL_NOT_FOUND",
      message: `未找到提案 ${params.proposalId}`,
    };
  }

  const nextStatus = params.nextStatus || "rejected";
  useContentEditReviewStore
    .getState()
    .updateProposal(proposal.proposalId, (current) => ({
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

export const restoreContentCheckpoint = async (
  params: RestoreCheckpointParams,
) => {
  const checkpoint = getContentEditCheckpoint(params.checkpointId);
  if (!checkpoint) {
    return {
      success: false as const,
      errorCode: "CHECKPOINT_NOT_FOUND",
      message: `未找到检查点 ${params.checkpointId}`,
    };
  }

  const checkpointExists = await cacheFileExists(checkpoint.filePath);
  if (!checkpointExists) {
    useContentEditReviewStore
      .getState()
      .updateCheckpoint(checkpoint.checkpointId, (current) => ({
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
  if (!checkpointPayload?.content) {
    return {
      success: false as const,
      errorCode: "CHECKPOINT_CACHE_INVALID",
      message: "检查点文件已损坏，无法恢复",
    };
  }

  const { snapshot } = await loadSnapshotForContent(checkpoint.contentId);
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
    contentId: checkpoint.contentId,
    content: checkpointPayload.content,
    sourceUuid: `content-edit-restore:${checkpoint.checkpointId}`,
  });
  updateSessionContentIfNeeded(checkpoint.contentId, persisted.content);

  useContentEditReviewStore
    .getState()
    .updateCheckpoint(checkpoint.checkpointId, (current) => ({
      ...current,
      restoredAt: now(),
      updatedAt: now(),
      lastRestoreError: undefined,
    }));

  const proposal = getContentEditProposal(checkpoint.proposalId);
  if (proposal) {
    useContentEditReviewStore
      .getState()
      .updateProposal(checkpoint.proposalId, (current) => ({
        ...current,
        status: "restored",
        updatedAt: now(),
        lastError: undefined,
      }));
  }

  const updatedProposal = proposal
    ? getContentEditProposal(checkpoint.proposalId)
    : undefined;

  return {
    success: true as const,
    checkpoint: getContentEditCheckpoint(checkpoint.checkpointId),
    proposal: updatedProposal,
    rendererPayload: updatedProposal
      ? buildRendererPayload({ proposal: updatedProposal })
      : undefined,
  };
};
