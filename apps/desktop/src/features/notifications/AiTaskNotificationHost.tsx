/**
 * AI 任务全局通知宿主（挂在主窗口 AppShell，随切库重建）：
 * - 对话完成 / 失败（piChatRuntime）
 * - 工具审批 / AI 提问（含子 Agent，处理完自动撤销）
 * - 子 Agent 异常失败（异步完成由父对话 settled 收敛）
 * - 正文 AI 改写待审阅（处理完自动撤销）
 * - 网页剪藏 AI 转换（webClipTaskRunner）
 * - Notebook 资料处理队列批次完成 / 失败
 * - 手动触发的知识库语义索引完成 / 失败
 */

import { useEffect } from "react";
import { useSettingsStore } from "@/app/settingsStore";
import { getVLActiveTasks } from "@/commands/vibe-learning";
import { getChatSession } from "@/commands/chat-session";
import type { VLResourceTaskStatus } from "@/types/vibe-learning";
import { NotebookResourceBatches } from "@/services/notifications/notebookResourceBatches";
import { onEmbeddingIndexProgress } from "@/commands/embedding-model";
import { listSubagents, onSubagentsChanged } from "@/commands/subagents";
import { off, on } from "@/electron";
import { openChatTarget, openContentById } from "@/services/notifications/aiTaskTargets";
import { useContentEditReviewStore } from "@/services/content-editing/proposal-store";
import { useContentEditReviewSessionStore } from "@/services/content-editing/review-session-store";
import { openEntity } from "@/services/open-content";
import { openPage } from "@/services/page-navigation";
import { piChatRuntime } from "@/services/piChatRuntime";
import { usePiInteractionStore } from "@/services/piInteractions";
import { webClipTaskRunner } from "@/services/webClipTaskRunner";
import type { SubagentView } from "@/types/subagent";
import { aiNotifyText } from "@/services/notifications/ai.i18n";
import {
  CHAT_TURN_MIN_ELAPSED_MS,
  currentDatabaseName,
  dismissAiNotice,
  dismissAllAiNotices,
  isSurfaceActive,
  isViewingPage,
  isViewingSettings,
  isCurrentDatabase,
  assertCurrentDatabase,
  notifyAiTask,
} from "@/services/notifications/aiNotify";

const VL_BATCH_SETTLE_MS = 1_200;

function isChatAttended(conversationKey: string): boolean {
  if (useSettingsStore.getState().open) return false;
  return isSurfaceActive(`chat:${conversationKey}`);
}

async function openChatByConversationKey(conversationKey: string): Promise<void> {
  const meta = piChatRuntime.findByKey(conversationKey);
  if (meta) {
    return openChatTarget(meta.chatScope || "main-chat", meta.chatId);
  }
  const stripped = conversationKey.includes("\u0000")
    ? conversationKey.slice(conversationKey.indexOf("\u0000") + 1)
    : conversationKey;
  const separator = stripped.indexOf(":");
  if (separator > 0) {
    const scope = stripped.slice(0, separator);
    const chatId = stripped.slice(separator + 1);
    if (scope === "main-chat") {
      useSettingsStore.getState().closeSettings();
      openPage("chat", { id: chatId });
      return;
    }
    const databaseName = conversationKey.includes("\u0000")
      ? conversationKey.slice(0, conversationKey.indexOf("\u0000"))
      : currentDatabaseName();
    assertCurrentDatabase(databaseName);
    const row = await getChatSession(chatId, databaseName);
    assertCurrentDatabase(databaseName);
    if (row)
      return openChatTarget(
        row.domainRef ? `${row.scope}:${row.domainRef}` : row.scope,
        chatId,
        databaseName
      );
  }
  throw new Error(aiNotifyText("error.targetUnavailable"));
}

export function AiTaskNotificationHost() {
  useEffect(() => {
    const dbName = currentDatabaseName();
    let disposed = false;

    /* ── 1. 对话完成 / 失败 ── */
    const offChatOutcome = piChatRuntime.onRunOutcome(outcome => {
      if (outcome.stopped) return;
      const noticeId = `chat-turn:${outcome.conversationKey}`;
      const viewAction = {
        label: aiNotifyText("action.view"),
        primary: true,
        reveal: true,
        onClick: () => openChatTarget(outcome.chatScope || "main-chat", outcome.chatId),
      };
      if (outcome.kind === "error") {
        notifyAiTask({
          id: noticeId,
          title: aiNotifyText("chat.replyFailedTitle"),
          body: outcome.errorMessage || outcome.title || aiNotifyText("chat.untitled"),
          source: aiNotifyText("source.chat"),
          icon: "messageSquare",
          tone: "danger",
          sticky: true,
          databaseName: outcome.databaseName || dbName,
          isOnSurface: () => isChatAttended(outcome.conversationKey),
          actions: [viewAction],
        });
        return;
      }
      notifyAiTask({
        id: noticeId,
        title: aiNotifyText("chat.replyReadyTitle"),
        body: outcome.title || aiNotifyText("chat.untitled"),
        source: aiNotifyText("source.chat"),
        icon: "messageSquare",
        tone: "ok",
        elapsedMs: outcome.elapsedMs,
        minElapsedMs: CHAT_TURN_MIN_ELAPSED_MS,
        databaseName: outcome.databaseName || dbName,
        isOnSurface: () => isChatAttended(outcome.conversationKey),
        actions: [viewAction],
      });
    });

    /* ── 2. 工具审批、提问与子 Agent 失败 ── */
    const seenRequestIds = new Set<string>();
    const activeInteractionNotices = new Map<string, string>();
    const subagentsByHostId = new Map<string, SubagentView>();
    const seenFailedRuns = new Set<string>();
    let subagentInitialized = false;
    let subagentRevision = -1;

    const syncInteractions = () => {
      const sessions = usePiInteractionStore.getState().sessions;
      const liveRequestIds = new Set<string>();
      let unresolved = false;

      for (const snapshot of Object.values(sessions)) {
        const subagent = subagentsByHostId.get(snapshot.sessionId);
        const chatMeta = subagent ? undefined : piChatRuntime.findBySessionId(snapshot.sessionId);
        if (!subagent && !chatMeta) {
          unresolved = true;
          for (const request of [...snapshot.approvals, ...snapshot.questions])
            liveRequestIds.add(request.requestId);
          continue;
        }

        for (const approval of snapshot.approvals) {
          liveRequestIds.add(approval.requestId);
          if (seenRequestIds.has(approval.requestId)) continue;
          seenRequestIds.add(approval.requestId);
          const noticeId = `ai-approval:${approval.requestId}`;
          const targetKey = subagent?.parentScope ?? chatMeta?.conversationKey;
          const sent = notifyAiTask({
            id: noticeId,
            title: subagent
              ? aiNotifyText("chat.subagentApprovalTitle", { agent: subagent.agent.title })
              : aiNotifyText("chat.approvalTitle"),
            body: aiNotifyText("chat.approvalBody", { tool: approval.toolName }),
            source: subagent ? aiNotifyText("source.subagent") : aiNotifyText("source.chat"),
            icon: "shieldAlert",
            tone: "neutral",
            sticky: true,
            databaseName: subagent?.agent.databaseName ?? chatMeta?.databaseName ?? dbName,
            isOnSurface: () => (targetKey ? isChatAttended(targetKey) : false),
            actions: targetKey
              ? [
                  {
                    label: aiNotifyText("action.review"),
                    primary: true,
                    reveal: true,
                    onClick: () =>
                      chatMeta
                        ? openChatTarget(chatMeta.chatScope || "main-chat", chatMeta.chatId)
                        : openChatByConversationKey(targetKey),
                  },
                ]
              : undefined,
          });
          if (sent) activeInteractionNotices.set(approval.requestId, sent);
        }

        for (const question of snapshot.questions) {
          liveRequestIds.add(question.requestId);
          if (seenRequestIds.has(question.requestId)) continue;
          seenRequestIds.add(question.requestId);
          const noticeId = `ai-question:${question.requestId}`;
          const targetKey = subagent?.parentScope ?? chatMeta?.conversationKey;
          const firstQuestion = question.payload.questions?.[0]?.question;
          const sent = notifyAiTask({
            id: noticeId,
            title: subagent
              ? aiNotifyText("chat.subagentQuestionTitle", { agent: subagent.agent.title })
              : aiNotifyText("chat.questionTitle"),
            body: firstQuestion || aiNotifyText("chat.questionFallback"),
            source: subagent ? aiNotifyText("source.subagent") : aiNotifyText("source.chat"),
            icon: "messageSquare",
            tone: "neutral",
            sticky: true,
            databaseName: subagent?.agent.databaseName ?? chatMeta?.databaseName ?? dbName,
            isOnSurface: () => (targetKey ? isChatAttended(targetKey) : false),
            actions: targetKey
              ? [
                  {
                    label: aiNotifyText("action.review"),
                    primary: true,
                    reveal: true,
                    onClick: () =>
                      chatMeta
                        ? openChatTarget(chatMeta.chatScope || "main-chat", chatMeta.chatId)
                        : openChatByConversationKey(targetKey),
                  },
                ]
              : undefined,
          });
          if (sent) activeInteractionNotices.set(question.requestId, sent);
        }
      }

      // 已处理或已取消的审批/提问：立即撤销对应通知卡
      for (const [requestId, noticeId] of [...activeInteractionNotices.entries()]) {
        if (liveRequestIds.has(requestId)) continue;
        activeInteractionNotices.delete(requestId);
        dismissAiNotice(noticeId);
      }
      return unresolved;
    };

    const refreshSubagents = async () => {
      try {
        const snapshot = await listSubagents();
        if (disposed || !isCurrentDatabase(dbName)) return;
        if (snapshot.revision < subagentRevision) return;
        subagentRevision = snapshot.revision;
        subagentsByHostId.clear();
        for (const view of snapshot.agents) {
          if (view.hostId) subagentsByHostId.set(view.hostId, view);
          const latestRun = view.runs.at(-1);
          if (!latestRun) continue;
          if (!subagentInitialized) {
            if (latestRun.status === "failed") seenFailedRuns.add(latestRun.runId);
            continue;
          }
          if (latestRun.status === "failed" && !seenFailedRuns.has(latestRun.runId)) {
            seenFailedRuns.add(latestRun.runId);
            const errorBody =
              latestRun.outcome?.status === "failed" ? latestRun.outcome.error.message : undefined;
            notifyAiTask({
              id: `subagent-failed:${latestRun.runId}`,
              title: aiNotifyText("chat.subagentFailedTitle", { agent: view.agent.title }),
              body: errorBody,
              source: aiNotifyText("source.subagent"),
              icon: "messageSquare",
              tone: "danger",
              sticky: true,
              databaseName: view.agent.databaseName || dbName,
              isOnSurface: () => isChatAttended(view.parentScope),
              actions: [
                {
                  label: aiNotifyText("action.view"),
                  primary: true,
                  reveal: true,
                  onClick: () => openChatByConversationKey(view.parentScope),
                },
              ],
            });
          }
        }
        subagentInitialized = true;
        syncInteractions();
      } catch {
        // 子 Agent 模块未就绪或切库中：静默忽略
      }
    };

    // 首次快照里已存在的历史请求按当前可见面正常检查，随后订阅实时更新
    let subagentRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleSubagentRefresh = () => {
      if (subagentRefreshTimer) return;
      subagentRefreshTimer = setTimeout(() => {
        subagentRefreshTimer = null;
        void refreshSubagents();
      }, 120);
    };
    const syncPendingInteractions = () => {
      if (syncInteractions()) scheduleSubagentRefresh();
    };
    const offInteractions = usePiInteractionStore.subscribe(syncPendingInteractions);
    const offChatState = piChatRuntime.subscribe(syncPendingInteractions);
    const offSubagents = onSubagentsChanged(scheduleSubagentRefresh);
    void refreshSubagents();

    /* ── 3. 正文 AI 改写待审阅 ── */
    const seenReviewIds = new Set<string>();
    const activeReviewNotices = new Map<string, string>();
    const syncEditReviews = () => {
      const state = useContentEditReviewSessionStore.getState();
      const pendingIds = new Set<string>();
      for (const record of Object.values(state.records)) {
        if (record.status === "pending") {
          pendingIds.add(record.sessionId);
          if (seenReviewIds.has(record.sessionId)) continue;
          seenReviewIds.add(record.sessionId);
          const proposal = useContentEditReviewStore.getState().proposals[record.proposalId];
          const noticeId = `edit-review:${record.sessionId}`;
          const sent = notifyAiTask({
            id: noticeId,
            title: aiNotifyText("edit.reviewTitle"),
            body: aiNotifyText("edit.reviewBodyUntitled"),
            source: aiNotifyText("source.contentEdit"),
            icon: "filePen",
            tone: "neutral",
            sticky: true,
            databaseName: proposal?.databaseName || dbName,
            isOnSurface: () => isChatAttended(record.conversationKey),
            actions: [
              {
                label: aiNotifyText("action.review"),
                primary: true,
                reveal: true,
                onClick: () =>
                  openContentById(record.payload.contentId, proposal?.databaseName || dbName),
              },
            ],
          });
          if (sent) activeReviewNotices.set(record.sessionId, sent);
        }
      }
      for (const [sessionId, noticeId] of [...activeReviewNotices.entries()]) {
        if (pendingIds.has(sessionId)) continue;
        activeReviewNotices.delete(sessionId);
        dismissAiNotice(noticeId);
      }
    };
    const offEditReviews = useContentEditReviewSessionStore.subscribe(syncEditReviews);
    syncEditReviews();

    /* ── 4. 网页剪藏 AI 转换 ── */
    const offClipComplete = webClipTaskRunner.onComplete(data => {
      notifyAiTask({
        id: `web-clip:${data.databaseName}:${data.projectItemId}`,
        title: aiNotifyText("webClip.doneTitle"),
        body: aiNotifyText("webClip.doneBody", { title: data.title || data.url }),
        source: aiNotifyText("source.webClip"),
        icon: "sparkles",
        tone: "ok",
        databaseName: data.databaseName,
        isOnSurface: () =>
          isViewingPage("project-detail", params => Number(params.itemId) === data.projectItemId),
        actions: [
          {
            label: aiNotifyText("action.view"),
            primary: true,
            reveal: true,
            onClick: () => {
              useSettingsStore.getState().closeSettings();
              return openEntity({ kind: "project-item", id: data.projectItemId });
            },
          },
        ],
      });
    });

    const offClipError = webClipTaskRunner.onError(data => {
      notifyAiTask({
        id: `web-clip:${data.databaseName}:${data.projectItemId}`,
        title: aiNotifyText("webClip.failedTitle"),
        body: data.error,
        source: aiNotifyText("source.webClip"),
        icon: "sparkles",
        tone: "danger",
        sticky: true,
        databaseName: data.databaseName,
        isOnSurface: () =>
          isViewingPage("project-detail", params => Number(params.itemId) === data.projectItemId),
        actions: [
          {
            label: aiNotifyText("action.view"),
            primary: true,
            reveal: true,
            onClick: () => {
              useSettingsStore.getState().closeSettings();
              return openEntity({ kind: "project-item", id: data.projectItemId });
            },
          },
        ],
      });
    });

    /* ── 5. Notebook 资料导入与处理队列（按 Notebook 聚合） ── */
    const resourceBatches = new NotebookResourceBatches();
    const vlBatchTimers = new Map<number, ReturnType<typeof setTimeout>>();
    let initialVlEvents: VLResourceTaskStatus[] | null = [];

    const flushVlBatch = (projectId: number) => {
      vlBatchTimers.delete(projectId);
      const batch = resourceBatches.takeReady(projectId);
      if (!batch) return;
      const { succeeded, failed } = batch;
      notifyAiTask({
        id: `vl-resources-batch:${projectId}`,
        title: aiNotifyText(
          failed > 0
            ? succeeded > 0
              ? "notebook.resourcePartialTitle"
              : "notebook.resourceFailedTitle"
            : "notebook.resourceDoneTitle"
        ),
        body:
          failed > 0
            ? succeeded > 0
              ? aiNotifyText("notebook.resourcePartialBody", { succeeded, failed })
              : aiNotifyText("notebook.resourceFailedBody", { count: failed })
            : aiNotifyText("notebook.resourceDoneBody", { count: succeeded }),
        source: aiNotifyText("source.notebook"),
        icon: "sparkles",
        tone: failed > 0 ? "danger" : "ok",
        sticky: failed > 0,
        databaseName: dbName,
        isOnSurface: () =>
          isViewingPage("vibe-learning-detail", params => Number(params.id) === projectId),
        actions: [
          {
            label: aiNotifyText("action.view"),
            primary: true,
            reveal: true,
            onClick: () => openPage("vibe-learning-detail", { id: projectId }),
          },
        ],
      });
    };
    const receiveVlStatus = (payload: VLResourceTaskStatus) => {
      resourceBatches.receive(payload);
      const previousTimer = vlBatchTimers.get(payload.projectId);
      if (previousTimer) clearTimeout(previousTimer);
      vlBatchTimers.set(
        payload.projectId,
        setTimeout(() => flushVlBatch(payload.projectId), VL_BATCH_SETTLE_MS)
      );
    };
    const handleVlStatus = (_event: unknown, payload: VLResourceTaskStatus) => {
      if (disposed || !payload?.taskId || !isCurrentDatabase(payload.mainDbName)) return;
      if (initialVlEvents) initialVlEvents.push(payload);
      else receiveVlStatus(payload);
    };
    on("vibe-learning-status-change", handleVlStatus);
    void getVLActiveTasks()
      .then(snapshot => {
        if (disposed || !isCurrentDatabase(dbName)) return;
        for (const task of snapshot) {
          if (isCurrentDatabase(task.mainDbName)) receiveVlStatus(task);
        }
      })
      .catch(error => {
        if (!disposed) console.warn("[ai-notifications] 恢复 Notebook 处理队列失败", error);
      })
      .finally(() => {
        if (disposed) return;
        const events = initialVlEvents;
        initialVlEvents = null;
        events?.forEach(receiveVlStatus);
      });

    /* ── 6. 手动触发的知识库语义索引 ── */
    const offEmbeddingProgress = onEmbeddingIndexProgress(progress => {
      if (progress.reason !== "manual") return;
      if (progress.phase !== "done" && progress.phase !== "failed") return;
      const openEmbeddingSettings = () => {
        useSettingsStore.getState().openSettings("embedding");
      };
      const isOnEmbedding = () => isViewingSettings("embedding");
      if (progress.phase === "failed") {
        notifyAiTask({
          id: "embedding-manual-index",
          title: aiNotifyText("index.libraryFailedTitle"),
          body: progress.error,
          source: aiNotifyText("source.index"),
          icon: "sparkles",
          tone: "danger",
          sticky: true,
          databaseName: progress.mainDbName || dbName,
          isOnSurface: isOnEmbedding,
          actions: [
            {
              label: aiNotifyText("action.view"),
              primary: true,
              reveal: true,
              onClick: openEmbeddingSettings,
            },
          ],
        });
        return;
      }
      if (progress.failed > 0) {
        notifyAiTask({
          id: "embedding-manual-index",
          title: aiNotifyText("index.libraryPartialTitle"),
          body: aiNotifyText("index.libraryPartialBody", {
            indexed: progress.indexed,
            failed: progress.failed,
          }),
          source: aiNotifyText("source.index"),
          icon: "sparkles",
          tone: "danger",
          sticky: true,
          databaseName: progress.mainDbName || dbName,
          isOnSurface: isOnEmbedding,
          actions: [
            {
              label: aiNotifyText("action.view"),
              primary: true,
              reveal: true,
              onClick: openEmbeddingSettings,
            },
          ],
        });
        return;
      }
      notifyAiTask({
        id: "embedding-manual-index",
        title: aiNotifyText("index.libraryDoneTitle"),
        body: aiNotifyText("index.libraryDoneBody", { count: progress.indexed }),
        source: aiNotifyText("source.index"),
        icon: "sparkles",
        tone: "ok",
        databaseName: progress.mainDbName || dbName,
        isOnSurface: isOnEmbedding,
        actions: [
          {
            label: aiNotifyText("action.view"),
            primary: true,
            reveal: true,
            onClick: openEmbeddingSettings,
          },
        ],
      });
    });

    return () => {
      disposed = true;
      offChatOutcome();
      offInteractions();
      offChatState();
      offSubagents();
      if (subagentRefreshTimer) clearTimeout(subagentRefreshTimer);
      offEditReviews();
      offClipComplete();
      offClipError();
      off("vibe-learning-status-change", handleVlStatus);
      for (const timer of vlBatchTimers.values()) clearTimeout(timer);
      offEmbeddingProgress();
      dismissAllAiNotices();
    };
  }, []);

  return null;
}
