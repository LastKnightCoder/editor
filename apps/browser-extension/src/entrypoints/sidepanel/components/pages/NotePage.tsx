import { useState, useMemo, useRef, useEffect } from "react";
import { getExtensionKit } from "../../../../services/editorKit";
import { useMemoizedFn } from "ahooks";
import { v4 as uuidv4 } from "uuid";
import { Trash2, MoreHorizontal, CreditCard, FileText, FolderInput, RefreshCw } from "lucide-react";
import { IconButton, Menu, cn, toast } from "@tau/ui";
import { useConfirmPrompt } from "../../../../hooks/useConfirmPrompt";
import { Editor } from "@tau/editor";
import webviewExtension from "@tau/editor/extensions/webview";
import { EditText } from "@tau/shared";
import type { EditTextHandle } from "@tau/shared";
import type { Descendant } from "slate";
import type WebSocketClient from "../../../../utils/WebSocketClient";
import { SubpageHeader } from "../SubpageHeader";
import { extensionImportFromMarkdown } from "../../../../services/editorRegistry";

import { useAiServerWebSocket } from "../../../../hooks/useAiServerWebSocket";
import { useNotes } from "../../../../hooks/useNotes";
import { resolveRemoteSyncRequirement } from "./sharedContentSync";

/** 进入笔记页的目的：打开某篇，或新建一篇 */
export type NoteIntent = { type: "open"; noteId: string } | { type: "new" };

interface NotePageProps {
  wsClient: WebSocketClient | null;
  url: string | null;
  intent: NoteIntent;
  onBack: () => void;
}

/** More 菜单项 */
interface MoreMenuItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

interface SharedContentRecord {
  id: number;
  updateTime: number;
  content: Descendant[];
}

interface EnsureContentResult {
  contentId: number;
  mode: "created" | "updated" | "synced-from-app";
}

interface RemoteContentUpdatedNotificationData {
  contentId: number;
  updateTime: number;
  sourceUuid: string;
}

type SyncHintTone = "neutral" | "success" | "warning" | "error";

interface SyncHintState {
  text: string;
  tone: SyncHintTone;
  spinning?: boolean;
}

/**
 * 笔记二级页：整页编辑一篇本页笔记；与应用内卡片 / 文章的同步状态在标题右侧，
 * 创建卡片 / 文章、插入到项目、删除在 ⋯ 里。
 */
export default function NotePage({ wsClient, url, intent, onBack }: NotePageProps) {
  // 连接 aiServer，用于 settings/content/card/article 等 RPC 调用
  const { client: aiWsClient, status: aiWsStatus } = useAiServerWebSocket();
  const { confirm: confirmPrompt, confirmDialog } = useConfirmPrompt();

  const titleRef = useRef<EditTextHandle>(null);
  const contentSubscriberIdRef = useRef(uuidv4());
  const currentSyncTargetRef = useRef<{
    dbName: string | null;
    contentId: number | null;
  }>({
    dbName: null,
    contentId: null,
  });
  const remoteSyncInFlightRef = useRef<Promise<void> | null>(null);
  const syncHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isCard, setIsCard] = useState(false);
  const [isArticle, setIsArticle] = useState(false);
  const [hasSharedContent, setHasSharedContent] = useState(false);
  const [editorSyncVersion, setEditorSyncVersion] = useState(0);
  const [syncHint, setSyncHint] = useState<SyncHintState | null>(null);

  const {
    notes,
    activeNoteId,
    content,
    isLoading,
    createNote,
    deleteNote,
    renameNote,
    selectNote,
    saveNoteContent,
    getContentId,
    getSyncedContentUpdateTime,
    replaceActiveNoteContent,
  } = useNotes(url);

  // 进入时按目的选中或新建一次（之后的切换由返回本页流再进入完成）
  const intentAppliedRef = useRef(false);
  useEffect(() => {
    if (isLoading || intentAppliedRef.current || !url) return;
    intentAppliedRef.current = true;
    if (intent.type === "new") {
      void createNote();
    } else if (intent.noteId !== activeNoteId && notes.some(n => n.id === intent.noteId)) {
      void selectNote(intent.noteId);
    }
  }, [activeNoteId, createNote, intent, isLoading, notes, selectNote, url]);

  const editorKit = getExtensionKit(wsClient);

  const activeNote = useMemo(
    () => notes.find(note => note.id === activeNoteId),
    [notes, activeNoteId]
  );
  const activeNoteContentIdMapKey = useMemo(
    () => JSON.stringify(activeNote?.contentIdMap ?? {}),
    [activeNote?.contentIdMap]
  );
  const editorKey = `${activeNoteId ?? "empty"}-${editorSyncVersion}`;

  const clearSyncHintTimer = useMemoizedFn(() => {
    if (syncHintTimerRef.current) {
      clearTimeout(syncHintTimerRef.current);
      syncHintTimerRef.current = null;
    }
  });

  const showSyncHint = useMemoizedFn(
    (text: string, tone: SyncHintTone, options?: { spinning?: boolean; durationMs?: number }) => {
      clearSyncHintTimer();
      setSyncHint({
        text,
        tone,
        spinning: options?.spinning,
      });
      const durationMs = options?.durationMs ?? 2600;
      if (durationMs > 0) {
        syncHintTimerRef.current = setTimeout(() => {
          setSyncHint(current => (current?.text === text ? null : current));
          syncHintTimerRef.current = null;
        }, durationMs);
      }
    }
  );

  useEffect(() => {
    setSyncHint(null);
    clearSyncHintTimer();
  }, [activeNoteId, clearSyncHintTimer]);

  useEffect(
    () => () => {
      clearSyncHintTimer();
    },
    [clearSyncHintTimer]
  );

  // 获取当前数据库名（打开 More 菜单时刷新）
  const fetchCurrentDbName = useMemoizedFn(async () => {
    if (!aiWsClient) return null;
    try {
      const result = (await aiWsClient.sendRequest("settings.getCurrentDatabase", {})) as {
        dbName: string;
      };
      return result.dbName;
    } catch (error) {
      console.error("获取当前数据库失败:", error);
      return null;
    }
  });

  const updateRemoteContentSubscription = useMemoizedFn(async (contentIds: number[]) => {
    if (!aiWsClient?.isConnected) return;
    await aiWsClient.sendRequest("content.subscription.set", {
      subscriberId: contentSubscriberIdRef.current,
      contentIds,
    });
  });

  const fetchSharedContent = useMemoizedFn(
    async (contentId: number): Promise<SharedContentRecord | null> => {
      if (!aiWsClient) return null;
      const result = (await aiWsClient.sendRequest("content.getById", {
        contentId,
      })) as {
        content: SharedContentRecord | null;
      };
      return result.content;
    }
  );

  const confirmSyncFromApp = useMemoizedFn((content: string) =>
    confirmPrompt({
      title: "同步应用中的最新内容",
      description: content,
      confirmText: "同步回来",
    })
  );

  const applyRemoteContentToNote = useMemoizedFn(
    async (payload: { dbName: string; contentId: number; remote: SharedContentRecord }) => {
      await replaceActiveNoteContent(payload.remote.content, {
        dbName: payload.dbName,
        contentId: payload.contentId,
        syncedContentUpdateTime: payload.remote.updateTime,
        contentUpdatedAt: payload.remote.updateTime,
      });
      setEditorSyncVersion(version => version + 1);
    }
  );

  /**
   * 确保 contentId 存在：无则创建内容，有则更新内容
   * 返回可用的 contentId，失败返回 null
   */
  const ensureContentId = useMemoizedFn(
    async (dbName: string): Promise<EnsureContentResult | null> => {
      if (!aiWsClient || !activeNoteId || !content) return null;

      const existingId = getContentId(dbName);
      const localContentUpdatedAt = activeNote?.contentUpdatedAt ?? activeNote?.updatedAt ?? 0;
      const lastSyncedContentUpdateTime = getSyncedContentUpdateTime(dbName);

      try {
        if (existingId) {
          const remote = await fetchSharedContent(existingId);
          if (!remote) {
            throw new Error("共享内容不存在，可能已被删除");
          }

          const contentMatchesRemote = JSON.stringify(content) === JSON.stringify(remote.content);
          if (contentMatchesRemote) {
            await replaceActiveNoteContent(content, {
              dbName,
              contentId: existingId,
              syncedContentUpdateTime: remote.updateTime,
              contentUpdatedAt: remote.updateTime,
            });
            return { contentId: existingId, mode: "synced-from-app" };
          }

          const syncRequirement = resolveRemoteSyncRequirement({
            remoteUpdateTime: remote.updateTime,
            lastSyncedContentUpdateTime,
            localContentUpdatedAt,
            contentMatchesRemote,
          });

          if (syncRequirement === "pull-remote") {
            await applyRemoteContentToNote({
              dbName,
              contentId: existingId,
              remote,
            });
            return { contentId: existingId, mode: "synced-from-app" };
          }

          if (syncRequirement === "confirm-sync") {
            const confirmed = await confirmSyncFromApp(
              "应用中的共享内容已经更新。继续会覆盖应用里的卡片/文章内容，建议先同步回来。"
            );
            if (!confirmed) {
              throw new Error("SYNC_CANCELLED");
            }
            await applyRemoteContentToNote({
              dbName,
              contentId: existingId,
              remote,
            });
            return { contentId: existingId, mode: "synced-from-app" };
          }

          // 已有 contentId，且本地内容是最新的，回写到应用侧共享内容
          const result = (await aiWsClient.sendRequest("content.update", {
            contentId: existingId,
            content,
          })) as {
            success: boolean;
            content: SharedContentRecord | null;
          };
          if (result.content) {
            await replaceActiveNoteContent(content, {
              dbName,
              contentId: existingId,
              syncedContentUpdateTime: result.content.updateTime,
              contentUpdatedAt: result.content.updateTime,
            });
          }
          return { contentId: existingId, mode: "updated" };
        } else {
          // 无 contentId，创建内容
          const result = (await aiWsClient.sendRequest("content.create", {
            content,
          })) as {
            contentId: number;
            content: SharedContentRecord | null;
          };
          const newContentId = result.contentId;
          if (newContentId) {
            await replaceActiveNoteContent(content, {
              dbName,
              contentId: newContentId,
              syncedContentUpdateTime: result.content?.updateTime,
              contentUpdatedAt: result.content?.updateTime ?? Date.now(),
            });
          }
          return { contentId: newContentId, mode: "created" };
        }
      } catch (error) {
        console.error("确保 contentId 失败:", error);
        throw error;
      }
    }
  );

  const syncContentFromApp = useMemoizedFn(async (): Promise<boolean> => {
    if (!aiWsClient || !activeNoteId || !content) return false;

    const dbName = await fetchCurrentDbName();
    if (!dbName) {
      throw new Error("未连接到桌面端");
    }

    const contentId = getContentId(dbName);
    if (!contentId) {
      throw new Error("当前笔记尚未关联到应用内容");
    }

    const remote = await fetchSharedContent(contentId);
    if (!remote) {
      throw new Error("共享内容不存在，可能已被删除");
    }

    const contentMatchesRemote = JSON.stringify(content) === JSON.stringify(remote.content);
    const lastSyncedContentUpdateTime = getSyncedContentUpdateTime(dbName);
    const localHasPendingEdits =
      !contentMatchesRemote &&
      (activeNote?.contentUpdatedAt ?? activeNote?.updatedAt ?? 0) >
        (lastSyncedContentUpdateTime ?? 0);

    if (localHasPendingEdits) {
      const confirmed = await confirmSyncFromApp(
        "当前插件笔记也有未同步修改。同步后会用应用中的内容覆盖当前笔记。"
      );
      if (!confirmed) {
        throw new Error("SYNC_CANCELLED");
      }
    }

    if (contentMatchesRemote) {
      await replaceActiveNoteContent(content, {
        dbName,
        contentId,
        syncedContentUpdateTime: remote.updateTime,
        contentUpdatedAt: remote.updateTime,
      });
      return false;
    }

    await applyRemoteContentToNote({
      dbName,
      contentId,
      remote,
    });
    return true;
  });

  const handleRemoteContentUpdated = useMemoizedFn(
    async (payload: RemoteContentUpdatedNotificationData) => {
      const target = currentSyncTargetRef.current;
      if (!target.dbName || !target.contentId) return;
      if (payload.contentId !== target.contentId) return;
      if (payload.sourceUuid === "browser-extension") return;
      if (!activeNoteId || !content) return;

      const remote = await fetchSharedContent(payload.contentId);
      if (!remote) return;

      const contentMatchesRemote = JSON.stringify(content) === JSON.stringify(remote.content);
      const lastSyncedContentUpdateTime = getSyncedContentUpdateTime(target.dbName);
      const localContentUpdatedAt = activeNote?.contentUpdatedAt ?? activeNote?.updatedAt ?? 0;

      if (contentMatchesRemote) {
        await replaceActiveNoteContent(content, {
          dbName: target.dbName,
          contentId: payload.contentId,
          syncedContentUpdateTime: remote.updateTime,
          contentUpdatedAt: remote.updateTime,
        });
        showSyncHint("已与应用保持同步", "neutral");
        return;
      }

      const syncRequirement = resolveRemoteSyncRequirement({
        remoteUpdateTime: remote.updateTime,
        lastSyncedContentUpdateTime,
        localContentUpdatedAt,
        contentMatchesRemote,
      });

      if (syncRequirement === "pull-remote") {
        showSyncHint("正在同步应用更新", "neutral", {
          spinning: true,
          durationMs: 0,
        });
        await applyRemoteContentToNote({
          dbName: target.dbName,
          contentId: payload.contentId,
          remote,
        });
        showSyncHint("已自动同步应用更新", "success");
        toast.info("已自动同步应用中的最新内容");
        return;
      }

      showSyncHint("应用内容已更新，等待确认", "warning", {
        durationMs: 5000,
      });
      const confirmed = await confirmSyncFromApp(
        "应用中的共享内容刚刚更新。当前笔记也有未同步修改，是否用应用中的最新内容覆盖本地笔记？"
      );
      if (!confirmed) {
        showSyncHint("已保留本地修改", "warning");
        return;
      }

      showSyncHint("正在同步应用更新", "neutral", {
        spinning: true,
        durationMs: 0,
      });
      await applyRemoteContentToNote({
        dbName: target.dbName,
        contentId: payload.contentId,
        remote,
      });
      showSyncHint("已同步应用中的最新内容", "success");
      toast.info("已同步应用中的最新内容");
    }
  );

  useEffect(() => {
    let cancelled = false;

    const syncSubscription = async () => {
      if (!aiWsClient || aiWsStatus !== "connected") {
        currentSyncTargetRef.current = { dbName: null, contentId: null };
        return;
      }

      const dbName = await fetchCurrentDbName();
      if (cancelled) return;

      const contentId = dbName ? getContentId(dbName) : null;
      currentSyncTargetRef.current = {
        dbName: dbName ?? null,
        contentId,
      };
      setHasSharedContent(Boolean(contentId));

      try {
        await updateRemoteContentSubscription(contentId ? [contentId] : []);
      } catch (error) {
        console.error("更新远端内容订阅失败:", error);
      }
    };

    void syncSubscription();

    return () => {
      cancelled = true;
      currentSyncTargetRef.current = { dbName: null, contentId: null };
      if (aiWsClient?.isConnected) {
        void updateRemoteContentSubscription([]).catch(error => {
          console.error("清理远端内容订阅失败:", error);
        });
      }
    };
  }, [
    aiWsClient,
    aiWsStatus,
    fetchCurrentDbName,
    getContentId,
    updateRemoteContentSubscription,
    activeNoteId,
    activeNoteContentIdMapKey,
  ]);

  useEffect(() => {
    if (!aiWsClient) return;

    const handleNotification = (data: unknown) => {
      const payload = data as RemoteContentUpdatedNotificationData;
      if (remoteSyncInFlightRef.current) {
        return;
      }

      remoteSyncInFlightRef.current = (async () => {
        try {
          await handleRemoteContentUpdated(payload);
        } catch (error) {
          console.error("处理应用内容主动同步失败:", error);
        } finally {
          remoteSyncInFlightRef.current = null;
        }
      })();
    };

    aiWsClient.registerNotificationHandler("content.remoteUpdated", handleNotification);

    return () => {
      aiWsClient.unregisterNotificationHandler("content.remoteUpdated", handleNotification);
    };
  }, [aiWsClient, handleRemoteContentUpdated]);

  // 创建/更新卡片
  const handleBuildCard = useMemoizedFn(async () => {
    if (!aiWsClient || actionLoading) return;
    setActionLoading(true);
    setShowMoreMenu(false);

    try {
      const dbName = await fetchCurrentDbName();
      if (!dbName) throw new Error("未连接到桌面端");

      const ensured = await ensureContentId(dbName);
      if (!ensured?.contentId) throw new Error("内容保存失败");

      await aiWsClient.sendRequest("card.buildFromContent", {
        contentId: ensured.contentId,
      });
      toast.success(
        ensured.mode === "synced-from-app" ? "已同步应用内容并刷新卡片" : "卡片创建成功"
      );
    } catch (error) {
      if ((error as Error)?.message === "SYNC_CANCELLED") return;
      console.error("创建/更新卡片失败:", error);
      toast.error("创建卡片失败");
    } finally {
      setActionLoading(false);
    }
  });

  // 创建/更新文章
  const handleBuildArticle = useMemoizedFn(async () => {
    if (!aiWsClient || actionLoading) return;
    setActionLoading(true);
    setShowMoreMenu(false);

    try {
      const dbName = await fetchCurrentDbName();
      if (!dbName) throw new Error("未连接到桌面端");

      const ensured = await ensureContentId(dbName);
      if (!ensured?.contentId) throw new Error("内容保存失败");

      await aiWsClient.sendRequest("article.buildFromContent", {
        contentId: ensured.contentId,
        title: activeNote?.title || "",
      });
      toast.success(
        ensured.mode === "synced-from-app" ? "已同步应用内容并刷新文章" : "文章创建成功"
      );
    } catch (error) {
      if ((error as Error)?.message === "SYNC_CANCELLED") return;
      console.error("创建/更新文章失败:", error);
      toast.error("创建文章失败");
    } finally {
      setActionLoading(false);
    }
  });

  // 插入/更新到项目（桌面端弹窗）
  const handleInsertToProject = useMemoizedFn(async () => {
    if (!aiWsClient || actionLoading) return;
    setActionLoading(true);
    setShowMoreMenu(false);

    try {
      const dbName = await fetchCurrentDbName();
      if (!dbName) throw new Error("未连接到桌面端");

      const ensured = await ensureContentId(dbName);
      if (!ensured?.contentId) throw new Error("内容保存失败");

      await aiWsClient.sendRequest("note.showInsertModal", {
        mode: "project",
        sourceContentId: ensured.contentId,
      });
      toast.success("已发送到桌面端");
    } catch (error) {
      if ((error as Error)?.message === "SYNC_CANCELLED") return;
      console.error("插入到项目失败:", error);
      toast.error("插入到项目失败");
    } finally {
      setActionLoading(false);
    }
  });

  // 仅更新共享内容到桌面端数据库（不构建卡片/文章）
  const handleUpdateContent = useMemoizedFn(async () => {
    if (!aiWsClient || actionLoading) return;
    setActionLoading(true);
    setShowMoreMenu(false);
    try {
      const dbName = await fetchCurrentDbName();
      if (!dbName) throw new Error("未连接到桌面端");
      const ensured = await ensureContentId(dbName);
      if (!ensured?.contentId) throw new Error("内容更新失败");
      toast.success(ensured.mode === "synced-from-app" ? "已从应用同步最新内容" : "内容更新成功");
    } catch (error) {
      if ((error as Error)?.message === "SYNC_CANCELLED") return;
      console.error("更新内容失败:", error);
      toast.error("更新内容失败");
    } finally {
      setActionLoading(false);
    }
  });

  const handleSyncFromApp = useMemoizedFn(async () => {
    if (!aiWsClient || actionLoading) return;
    setActionLoading(true);
    setShowMoreMenu(false);

    try {
      showSyncHint("正在从应用同步", "neutral", {
        spinning: true,
        durationMs: 0,
      });
      const changed = await syncContentFromApp();
      showSyncHint(changed ? "已从应用同步最新内容" : "已与应用保持同步", "success");
      toast.success(changed ? "已从应用同步最新内容" : "已与应用内容保持同步");
    } catch (error) {
      if ((error as Error)?.message === "SYNC_CANCELLED") {
        showSyncHint("已保留本地修改", "warning");
        return;
      }
      showSyncHint("同步应用内容失败", "error", {
        durationMs: 4000,
      });
      console.error("从应用同步内容失败:", error);
      toast.error("同步应用内容失败");
    } finally {
      setActionLoading(false);
    }
  });

  // More 菜单项：根据卡片/文章关联状态动态构建
  const moreMenuItems: MoreMenuItem[] = useMemo(() => {
    const items: MoreMenuItem[] = [];

    if (hasSharedContent) {
      items.push({
        key: "sync-from-app",
        icon: <RefreshCw size={14} />,
        label: "从应用同步",
        onClick: handleSyncFromApp,
      });
    }

    if (isCard && isArticle) {
      // 两者都已关联，合并为单个"更新内容"
      items.push({
        key: "update-content",
        icon: <RefreshCw size={14} />,
        label: "更新内容",
        onClick: handleUpdateContent,
      });
    } else {
      // 卡片项：已关联显示"更新内容"，未关联显示"创建卡片"
      items.push(
        isCard
          ? {
              key: "update-content-card",
              icon: <RefreshCw size={14} />,
              label: "更新内容",
              onClick: handleUpdateContent,
            }
          : {
              key: "build-card",
              icon: <CreditCard size={14} />,
              label: "创建卡片",
              onClick: handleBuildCard,
            }
      );
      // 文章项：已关联显示"更新内容"，未关联显示"创建文章"
      items.push(
        isArticle
          ? {
              key: "update-content-article",
              icon: <RefreshCw size={14} />,
              label: "更新内容",
              onClick: handleUpdateContent,
            }
          : {
              key: "build-article",
              icon: <FileText size={14} />,
              label: "创建文章",
              onClick: handleBuildArticle,
            }
      );
    }

    // 始终显示
    items.push({
      key: "insert-project",
      icon: <FolderInput size={14} />,
      label: "插入到项目",
      onClick: handleInsertToProject,
    });

    return items;
  }, [
    hasSharedContent,
    isCard,
    isArticle,
    handleSyncFromApp,
    handleUpdateContent,
    handleBuildCard,
    handleBuildArticle,
    handleInsertToProject,
  ]);

  // 打开 ⋯ 时刷新数据库名和卡片 / 文章关联状态，决定显示「创建」还是「更新内容」
  const handleMoreMenuOpenChange = useMemoizedFn(async (open: boolean) => {
    setShowMoreMenu(open);
    if (!open) return;
    const dbName = await fetchCurrentDbName();
    if (dbName && aiWsClient) {
      const cid = getContentId(dbName);
      setHasSharedContent(Boolean(cid));
      if (cid) {
        const [cardRes, articleRes] = await Promise.all([
          aiWsClient.sendRequest("card.isContentIsCard", { contentId: cid }),
          aiWsClient.sendRequest("article.isContentIsArticle", { contentId: cid }),
        ]);
        setIsCard((cardRes as { isCard: boolean }).isCard);
        setIsArticle((articleRes as { isArticle: boolean }).isArticle);
      } else {
        setIsCard(false);
        setIsArticle(false);
      }
    } else {
      setHasSharedContent(false);
    }
  });

  const handleDeleteNote = useMemoizedFn(async () => {
    if (!activeNoteId) return;
    const ok = await confirmPrompt({
      title: "删除笔记",
      description: "确定删除这个笔记吗？",
      danger: true,
      confirmText: "删除",
    });
    if (!ok) return;
    await deleteNote(activeNoteId);
    onBack();
  });

  const handleEditorChange = useMemoizedFn((value: Descendant[]) => {
    saveNoteContent(value);
  });

  const handleTitleChange = useMemoizedFn((value: string) => {
    if (activeNoteId && value.trim()) {
      renameNote(activeNoteId, value.trim());
    }
  });

  const syncHintClassName =
    syncHint?.tone === "success"
      ? "text-ok"
      : syncHint?.tone === "warning"
        ? "text-warn"
        : syncHint?.tone === "error"
          ? "text-danger"
          : "text-ink-3";

  if (!url || isLoading || !activeNote || !content) {
    return (
      <div className="flex h-full flex-col">
        {confirmDialog}
        <SubpageHeader title="笔记" onBack={onBack} />
        <p className="text-tau-sm text-ink-3 px-6 pt-16 text-center">
          {!url
            ? "等待页面加载…"
            : isLoading || intent.type === "new"
              ? "加载中…"
              : "这篇笔记已不存在"}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface flex h-full flex-col">
      {confirmDialog}
      <SubpageHeader
        onBack={onBack}
        title={
          <EditText
            key={activeNoteId}
            ref={titleRef}
            className="min-w-0 truncate rounded px-1 outline-none"
            defaultValue={activeNote.title}
            contentEditable
            onBlur={() => {
              const value = titleRef.current?.getValue() || "";
              handleTitleChange(value);
            }}
          />
        }
        actions={
          <>
            {syncHint ? (
              <span
                className={cn(
                  "text-tau-tiny flex max-w-[45%] shrink-0 items-center gap-1 truncate",
                  syncHintClassName
                )}
              >
                {syncHint.spinning ? <RefreshCw className="size-3 shrink-0 animate-spin" /> : null}
                <span className="truncate">{syncHint.text}</span>
              </span>
            ) : null}
            <Menu
              align="end"
              className="w-[180px]"
              open={showMoreMenu}
              onOpenChange={open => void handleMoreMenuOpenChange(open)}
              trigger={
                <IconButton
                  aria-label="更多操作"
                  title="更多操作"
                  className="size-8"
                  disabled={actionLoading}
                >
                  <MoreHorizontal size={16} strokeWidth={1.75} />
                </IconButton>
              }
            >
              {moreMenuItems.map(item => (
                <Menu.Item key={item.key} icon={item.icon} onSelect={item.onClick}>
                  {item.label}
                </Menu.Item>
              ))}
              <Menu.Separator />
              <Menu.Item danger icon={<Trash2 />} onSelect={() => void handleDeleteNote()}>
                删除笔记
              </Menu.Item>
            </Menu>
          </>
        }
      />

      <div className="tau-scrollbar min-h-0 flex-1 overflow-y-auto">
        <Editor
          kit={editorKit}
          key={editorKey}
          initValue={content}
          onChange={handleEditorChange}
          readonly={false}
          placeHolder="在这里记录笔记..."
          style={{
            minHeight: "100%",
            padding: "16px 22px",
            fontSize: "15px",
          }}
        />
      </div>
    </div>
  );
}
