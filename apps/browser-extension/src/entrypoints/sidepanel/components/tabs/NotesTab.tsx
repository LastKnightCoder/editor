import { useState, useMemo, useRef, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import {
  ChevronDown,
  Plus,
  Trash2,
  StickyNote,
  MoreHorizontal,
  CreditCard,
  FileText,
  FolderInput,
  BookOpen,
  RefreshCw,
} from "lucide-react";
import { App } from "antd";
import { Editor, EditorServicesProvider } from "@tau/editor/src";
import { SelectDropDown, EditText } from "@tau/shared";
import type { EditTextHandle } from "@tau/shared";
import type { EditorRef } from "@tau/editor/src";
import type { Descendant } from "slate";
import type WebSocketClient from "../../../../utils/WebSocketClient";
import type { ResolvedTheme } from "../../../../utils/types";
import type { PendingNoteSelection } from "../MainLayout";
import { createExtensionEditorServices } from "../../../../services/editorServices";
import { useAiServerWebSocket } from "../../../../hooks/useAiServerWebSocket";
import { useNotes } from "../../../../hooks/useNotes";

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

export default function NotesTab({
  wsClient,
  resolvedTheme,
  url,
  pendingNoteRef,
}: NotesTabProps) {
  // 连接 aiServer，用于 settings/content/card/article 等 RPC 调用
  const { client: aiWsClient } = useAiServerWebSocket();
  const { message: antdMessage, modal } = App.useApp();

  const editorRef = useRef<EditorRef>(null);
  const titleRef = useRef<EditTextHandle>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const dropdownTriggerRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [isCard, setIsCard] = useState(false);
  const [isArticle, setIsArticle] = useState(false);

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
    updateNoteContentId,
    getContentId,
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
      const noteExists = notes.some((n) => n.id === pending.noteId);
      if (noteExists && pending.noteId !== activeNoteId) {
        selectNote(pending.noteId);
      }
    }
  }, [isLoading, url, notes, activeNoteId, selectNote, pendingNoteRef]);

  const editorServices = useMemo(
    () =>
      createExtensionEditorServices({
        wsClient,
        resolvedTheme,
      }),
    [wsClient, resolvedTheme],
  );

  const activeNote = useMemo(
    () => notes.find((note) => note.id === activeNoteId),
    [notes, activeNoteId],
  );

  // 获取当前数据库名（打开 More 菜单时刷新）
  const fetchCurrentDbName = useMemoizedFn(async () => {
    if (!aiWsClient) return null;
    try {
      const result = (await aiWsClient.sendRequest(
        "settings.getCurrentDatabase",
        {},
      )) as { dbName: string };
      return result.dbName;
    } catch (error) {
      console.error("获取当前数据库失败:", error);
      return null;
    }
  });

  /**
   * 确保 contentId 存在：无则创建内容，有则更新内容
   * 返回可用的 contentId，失败返回 null
   */
  const ensureContentId = useMemoizedFn(
    async (dbName: string): Promise<number | null> => {
      if (!aiWsClient || !activeNoteId || !content) return null;

      const existingId = getContentId(dbName);

      try {
        if (existingId) {
          // 已有 contentId，更新内容
          await aiWsClient.sendRequest("content.update", {
            contentId: existingId,
            content,
          });
          return existingId;
        } else {
          // 无 contentId，创建内容
          const result = (await aiWsClient.sendRequest("content.create", {
            content,
          })) as { contentId: number };
          const newContentId = result.contentId;
          if (newContentId) {
            await updateNoteContentId(activeNoteId, dbName, newContentId);
          }
          return newContentId;
        }
      } catch (error) {
        console.error("确保 contentId 失败:", error);
        return null;
      }
    },
  );

  // 创建/更新卡片
  const handleBuildCard = useMemoizedFn(async () => {
    if (!aiWsClient || actionLoading) return;
    setActionLoading(true);
    setShowMoreMenu(false);

    try {
      const dbName = await fetchCurrentDbName();
      if (!dbName) throw new Error("未连接到桌面端");

      const contentId = await ensureContentId(dbName);
      if (!contentId) throw new Error("内容保存失败");

      await aiWsClient.sendRequest("card.buildFromContent", {
        contentId,
      });
      antdMessage.success("卡片创建成功");
    } catch (error) {
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

      const contentId = await ensureContentId(dbName);
      if (!contentId) throw new Error("内容保存失败");

      await aiWsClient.sendRequest("article.buildFromContent", {
        contentId,
        title: activeNote?.title || "",
      });
      antdMessage.success("文章创建成功");
    } catch (error) {
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

      const contentId = await ensureContentId(dbName);
      if (!contentId) throw new Error("内容保存失败");

      await aiWsClient.sendRequest("note.showInsertModal", {
        mode: "project",
        contentId,
      });
      antdMessage.success("已发送到桌面端");
    } catch (error) {
      console.error("插入到项目失败:", error);
      antdMessage.error("插入到项目失败");
    } finally {
      setActionLoading(false);
    }
  });

  // 插入/更新到知识库（桌面端弹窗）
  const handleInsertToDocument = useMemoizedFn(async () => {
    if (!aiWsClient || actionLoading) return;
    setActionLoading(true);
    setShowMoreMenu(false);

    try {
      const dbName = await fetchCurrentDbName();
      if (!dbName) throw new Error("未连接到桌面端");

      const contentId = await ensureContentId(dbName);
      if (!contentId) throw new Error("内容保存失败");

      await aiWsClient.sendRequest("note.showInsertModal", {
        mode: "document",
        contentId,
      });
      antdMessage.success("已发送到桌面端");
    } catch (error) {
      console.error("插入到知识库失败:", error);
      antdMessage.error("插入到知识库失败");
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
      await ensureContentId(dbName);
      antdMessage.success("内容更新成功");
    } catch (error) {
      console.error("更新内容失败:", error);
      antdMessage.error("更新内容失败");
    } finally {
      setActionLoading(false);
    }
  });

  // More 菜单项：根据卡片/文章关联状态动态构建
  const moreMenuItems: MoreMenuItem[] = useMemo(() => {
    const items: MoreMenuItem[] = [];

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
            },
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
            },
      );
    }

    // 始终显示
    items.push(
      {
        key: "insert-project",
        icon: <FolderInput size={14} />,
        label: "插入到项目",
        onClick: handleInsertToProject,
      },
      {
        key: "insert-document",
        icon: <BookOpen size={14} />,
        label: "插入到知识库",
        onClick: handleInsertToDocument,
      },
    );

    return items;
  }, [
    isCard,
    isArticle,
    handleUpdateContent,
    handleBuildCard,
    handleBuildArticle,
    handleInsertToProject,
    handleInsertToDocument,
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
      }
    }
    setShowMoreMenu((prev) => !prev);
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

    sortedNotes.forEach((note) => {
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

  const handleDeleteClick = useMemoizedFn(
    (e: React.MouseEvent, noteId: string) => {
      e.stopPropagation();

      modal.confirm({
        title: "删除笔记",
        content: "确定删除这个笔记吗？",
        okText: "删除",
        cancelText: "取消",
        okButtonProps: { danger: true },
        onOk: () => deleteNote(noteId),
      });
    },
  );

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
            onClick={(e) => handleDeleteClick(e, item.noteId!)}
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

  if (!url) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <p className="text-center text-sm text-gray-400 dark:text-[#484f58]">
          等待页面加载...
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <p className="text-center text-sm text-gray-400 dark:text-[#484f58]">
          加载中...
        </p>
      </div>
    );
  }

  // 无笔记时显示空状态
  if (notes.length === 0 || !activeNote || !content) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <StickyNote
          size={48}
          className="mb-4 text-gray-300 dark:text-[#484f58]"
        />
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
            className="flex cursor-pointer items-center gap-1 rounded px-1 py-1 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
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

          {/* More 按钮 */}
          <button
            ref={moreButtonRef}
            className="flex shrink-0 cursor-pointer items-center justify-center rounded p-1 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 border-none bg-transparent"
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
        <EditorServicesProvider services={editorServices}>
          <Editor
            key={activeNoteId}
            ref={editorRef}
            initValue={content}
            onChange={handleEditorChange}
            readonly={false}
            theme={resolvedTheme}
            placeHolder="在这里记录笔记..."
            style={{
              minHeight: "100%",
              padding: "16px 32px",
              fontSize: "16px",
            }}
          />
        </EditorServicesProvider>
      </div>
    </div>
  );
}
