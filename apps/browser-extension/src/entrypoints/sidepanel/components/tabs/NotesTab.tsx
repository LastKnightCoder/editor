import { useState, useMemo, useRef, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { v4 as uuidv4 } from "uuid";
import {
  ChevronDown,
  Plus,
  Trash2,
  StickyNote,
  MoreHorizontal,
  CreditCard,
  FileText,
  FolderInput,
  RefreshCw,
} from "lucide-react";
import { App } from "antd";
import { Editor, EditorProvider, createMarkdownPasteImportExtension } from "@tau/editor/src";
import WebviewExtension from "@tau/editor-webview";
import { SelectDropDown, EditText } from "@tau/shared";
import type { EditTextHandle } from "@tau/shared";
import type { Descendant } from "slate";
import type WebSocketClient from "../../../../utils/WebSocketClient";
import type { ResolvedTheme } from "../../../../utils/types";
import type { PendingNoteSelection } from "../MainLayout";
import {
  createExtensionEditorRegistry,
  extensionImportFromMarkdown,
} from "../../../../services/editorRegistry";

import { useAiServerWebSocket } from "../../../../hooks/useAiServerWebSocket";
import { useNotes } from "../../../../hooks/useNotes";
import { resolveRemoteSyncRequirement } from "./sharedContentSync";

interface NotesTabProps {
  wsClient: WebSocketClient | null;
  resolvedTheme: ResolvedTheme;
  url: string | null;
  pendingNoteRef?: React.MutableRefObject<PendingNoteSelection | null>;
}

/** 笔记选择器下拉菜单项 */
interface NoteMenuItem {
  key: string;
  type: "new" | "note";
  noteId?: string;
  title: string;
  isActive?: boolean;
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

export default function NotesTab({ wsClient, resolvedTheme, url, pendingNoteRef }: NotesTabProps) {
  // 连接 aiServer，用于 settings/content/card/article 等 RPC 调用
  const { client: aiWsClient, status: aiWsStatus } = useAiServerWebSocket();
  const { message: antdMessage, modal } = App.useApp();

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
  const [showDropdown, setShowDropdown] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const dropdownTriggerRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
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

  // 从全部笔记页面跳转过来时，自动选中对应笔记
  useEffect(() => {
    if (
      !isLoading &&
      pendingNoteRef?.current &&
      url === pendingNoteRef.current.url &&
      notes.length > 0
    ) {
      const pending = pendingNoteRef.current;
      pendingNoteRef.current = null;
      const noteExists = notes.some(n => n.id === pending.noteId);
      if (noteExists && pending.noteId !== activeNoteId) {
        selectNote(pending.noteId);
      }
    }
  }, [isLoading, url, notes, activeNoteId, selectNote, pendingNoteRef]);

  const editorRegistry = useMemo(
    () =>
      createExtensionEditorRegistry({
        wsClient,
      }),
    [wsClient]
  );
  const editorExtensions = useMemo(
    () => [createMarkdownPasteImportExtension(extensionImportFromMarkdown), new WebviewExtension()],
    []
  );

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

  const confirmSyncFromApp = useMemoizedFn(
    (content: string): Promise<boolean> =>
      new Promise(resolve => {
        modal.confirm({
          title: "同步应用中的最新内容",
          content,
          okText: "同步回来",
          cancelText: "取消",
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
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
        antdMessage.info("已自动同步应用中的最新内容");
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
      antdMessage.info("已同步应用中的最新内容");
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
      antdMessage.success(
        ensured.mode === "synced-from-app" ? "已同步应用内容并刷新卡片" : "卡片创建成功"
      );
    } catch (error) {
      if ((error as Error)?.message === "SYNC_CANCELLED") return;
      console.error("创建/更新卡片失败:", error);
      antdMessage.error("创建卡片失败");
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
      antdMessage.success(
        ensured.mode === "synced-from-app" ? "已同步应用内容并刷新文章" : "文章创建成功"
      );
    } catch (error) {
      if ((error as Error)?.message === "SYNC_CANCELLED") return;
      console.error("创建/更新文章失败:", error);
      antdMessage.error("创建文章失败");
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
      antdMessage.success("已发送到桌面端");
    } catch (error) {
      if ((error as Error)?.message === "SYNC_CANCELLED") return;
      console.error("插入到项目失败:", error);
      antdMessage.error("插入到项目失败");
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
      antdMessage.success(
        ensured.mode === "synced-from-app" ? "已从应用同步最新内容" : "内容更新成功"
      );
    } catch (error) {
      if ((error as Error)?.message === "SYNC_CANCELLED") return;
      console.error("更新内容失败:", error);
      antdMessage.error("更新内容失败");
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
      antdMessage.success(changed ? "已从应用同步最新内容" : "已与应用内容保持同步");
    } catch (error) {
      if ((error as Error)?.message === "SYNC_CANCELLED") {
        showSyncHint("已保留本地修改", "warning");
        return;
      }
      showSyncHint("同步应用内容失败", "error", {
        durationMs: 4000,
      });
      console.error("从应用同步内容失败:", error);
      antdMessage.error("同步应用内容失败");
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

  // More 菜单项选择
  const handleMoreMenuSelect = useMemoizedFn((item: MoreMenuItem) => {
    item.onClick();
  });

  // 打开 More 菜单时刷新数据库名和卡片/文章关联状态
  const handleToggleMoreMenu = useMemoizedFn(async () => {
    if (!showMoreMenu) {
      const dbName = await fetchCurrentDbName();
      // 查询卡片/文章关联状态
      if (dbName && aiWsClient) {
        const cid = getContentId(dbName);
        setHasSharedContent(Boolean(cid));
        if (cid) {
          const [cardRes, articleRes] = await Promise.all([
            aiWsClient.sendRequest("card.isContentIsCard", { contentId: cid }),
            aiWsClient.sendRequest("article.isContentIsArticle", {
              contentId: cid,
            }),
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
    }
    setShowMoreMenu(prev => !prev);
  });

  // 构建笔记选择器下拉菜单项
  const menuItems: NoteMenuItem[] = useMemo(() => {
    const items: NoteMenuItem[] = [];

    // 新建笔记项
    items.push({
      key: "new",
      type: "new",
      title: "新建笔记",
    });

    // 笔记列表（按更新时间倒序）
    const sortedNotes = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);

    sortedNotes.forEach(note => {
      items.push({
        key: `note-${note.id}`,
        type: "note",
        noteId: note.id,
        title: note.title,
        isActive: note.id === activeNoteId,
      });
    });

    return items;
  }, [notes, activeNoteId]);

  const handleMenuSelect = useMemoizedFn((item: NoteMenuItem) => {
    if (item.type === "new") {
      createNote();
    } else if (item.noteId) {
      selectNote(item.noteId);
    }
    setShowDropdown(false);
  });

  const handleDeleteClick = useMemoizedFn((e: React.MouseEvent, noteId: string) => {
    e.stopPropagation();

    modal.confirm({
      title: "删除笔记",
      content: "确定删除这个笔记吗？",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: () => deleteNote(noteId),
    });
  });

  const renderMenuItem = useMemoizedFn((item: NoteMenuItem) => {
    if (item.type === "new") {
      return (
        <div className="flex items-center gap-2">
          <Plus size={14} />
          <span>新建笔记</span>
        </div>
      );
    }

    return (
      <div className="group flex w-full items-center justify-between gap-2">
        <span
          className={`flex-1 truncate ${item.isActive ? "font-medium text-blue-500 dark:text-blue-400" : ""}`}
        >
          {item.title}
        </span>
        {item.noteId && (
          <button
            onClick={e => handleDeleteClick(e, item.noteId!)}
            className="shrink-0 rounded p-1 text-red-500 opacity-0 transition-opacity hover:bg-red-50 group-hover:opacity-100 dark:text-red-400 dark:hover:bg-red-900/20"
            title="删除笔记"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    );
  });

  const handleEditorChange = useMemoizedFn((value: Descendant[]) => {
    saveNoteContent(value);
  });

  const handleTitleChange = useMemoizedFn((value: string) => {
    if (activeNoteId && value.trim()) {
      renameNote(activeNoteId, value.trim());
    }
  });

  const syncHintClassName = useMemo(() => {
    switch (syncHint?.tone) {
      case "success":
        return "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300";
      case "warning":
        return "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300";
      case "error":
        return "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300";
      default:
        return "bg-gray-50 text-gray-500 dark:bg-[#0d1117] dark:text-[#8b949e]";
    }
  }, [syncHint?.tone]);

  if (!url) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <p className="text-center text-sm text-gray-400 dark:text-[#484f58]">等待页面加载...</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <p className="text-center text-sm text-gray-400 dark:text-[#484f58]">加载中...</p>
      </div>
    );
  }

  // 无笔记时显示空状态
  if (notes.length === 0 || !activeNote || !content) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <StickyNote size={48} className="mb-4 text-gray-300 dark:text-[#484f58]" />
        <p className="mb-6 text-center text-sm text-gray-400 dark:text-[#484f58]">
          还没有笔记，开始记录吧
        </p>
        <button
          onClick={createNote}
          className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
        >
          <Plus size={16} />
          <span>新建笔记</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center border-b border-gray-100 px-4 dark:border-[#21262d]">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div
            ref={dropdownTriggerRef}
            className="flex cursor-pointer items-center gap-1 rounded px-1 py-1 transition-colors hover:bg-gray-100 dark:hover:bg-zinc-700"
            onClick={() => setShowDropdown(!showDropdown)}
          >
            <ChevronDown size={16} className="shrink-0 opacity-60" />
          </div>

          <SelectDropDown<NoteMenuItem>
            items={menuItems}
            selectedKey={`note-${activeNoteId}`}
            show={showDropdown}
            onClose={() => setShowDropdown(false)}
            onSelect={handleMenuSelect}
            triggerElement={dropdownTriggerRef.current}
            getKey={(item: NoteMenuItem) => item.key}
            renderItem={renderMenuItem}
            width={220}
            maxHeight={360}
            preferredPlacement="bottom"
          />
          <EditText
            key={activeNoteId}
            ref={titleRef}
            className="min-w-0 flex-1 truncate rounded px-1 py-1 text-sm font-semibold text-gray-900 outline-none dark:text-[#e6edf3]"
            defaultValue={activeNote.title}
            contentEditable
            onBlur={() => {
              const value = titleRef.current?.getValue() || "";
              handleTitleChange(value);
            }}
          />

          {syncHint ? (
            <span
              className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${syncHintClassName}`}
            >
              {syncHint.spinning ? <RefreshCw className="h-3 w-3 animate-spin" /> : null}
              <span>{syncHint.text}</span>
            </span>
          ) : null}

          {/* More 按钮 */}
          <button
            ref={moreButtonRef}
            className="flex shrink-0 cursor-pointer items-center justify-center rounded border-none bg-transparent p-1 transition-colors hover:bg-gray-100 dark:hover:bg-zinc-700"
            onClick={handleToggleMoreMenu}
            disabled={actionLoading}
          >
            <MoreHorizontal size={16} className="opacity-60" />
          </button>
          <SelectDropDown<MoreMenuItem>
            items={moreMenuItems}
            selectedKey=""
            show={showMoreMenu}
            onClose={() => setShowMoreMenu(false)}
            onSelect={handleMoreMenuSelect}
            triggerElement={moreButtonRef.current}
            getKey={(item: MoreMenuItem) => item.key}
            width={160}
            renderItem={(item: MoreMenuItem) => (
              <div className="flex items-center gap-2">
                {item.icon}
                <span>{item.label}</span>
              </div>
            )}
          />
        </div>
      </div>

      {/* 编辑器区域 */}
      <div className="tau-scrollbar flex-1 overflow-y-auto">
        <EditorProvider registry={editorRegistry} extensions={editorExtensions}>
          <Editor
            key={editorKey}
            initValue={content}
            onChange={handleEditorChange}
            readonly={false}
            placeHolder="在这里记录笔记..."
            style={{
              minHeight: "100%",
              padding: "16px 32px",
              fontSize: "16px",
            }}
          />
        </EditorProvider>
      </div>
    </div>
  );
}
