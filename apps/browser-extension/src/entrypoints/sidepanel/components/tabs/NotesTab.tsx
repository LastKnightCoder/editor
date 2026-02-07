import { useState, useMemo, useCallback, useRef } from "react";
import { ChevronDown, Plus, Trash2, StickyNote } from "lucide-react";
import { Editor, EditorServicesProvider } from "@tau/editor/src";
import { SelectDropDown, EditText } from "@tau/shared";
import type { EditTextHandle } from "@tau/shared";
import type { EditorRef } from "@tau/editor/src";
import type { Descendant } from "slate";
import type WebSocketClient from "../../../../utils/WebSocketClient";
import type { ResolvedTheme, NoteMetadata } from "../../../../utils/types";
import { createExtensionEditorServices } from "../../../../services/editorServices";
import { useNotes } from "../../../../hooks/useNotes";

interface NotesTabProps {
  wsClient: WebSocketClient | null;
  resolvedTheme: ResolvedTheme;
  url: string | null;
}

interface MenuItem {
  key: string;
  type: "new" | "note";
  noteId?: string;
  title: string;
  isActive?: boolean;
}

export default function NotesTab({
  wsClient,
  resolvedTheme,
  url,
}: NotesTabProps) {
  const editorRef = useRef<EditorRef>(null);
  const titleRef = useRef<EditTextHandle>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownTriggerRef = useRef<HTMLDivElement>(null);

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
  } = useNotes(url);

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

  // 构建下拉菜单项
  const menuItems: MenuItem[] = useMemo(() => {
    const items: MenuItem[] = [];

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

  const handleMenuSelect = useCallback(
    (item: MenuItem) => {
      if (item.type === "new") {
        createNote();
      } else if (item.noteId) {
        selectNote(item.noteId);
      }
      setShowDropdown(false);
    },
    [createNote, selectNote],
  );

  const handleDeleteClick = useCallback(
    async (e: React.MouseEvent, noteId: string) => {
      e.stopPropagation();

      if (confirm("确定删除这个笔记吗？")) {
        await deleteNote(noteId);
      }
    },
    [deleteNote],
  );

  const renderMenuItem = useCallback(
    (item: MenuItem) => {
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
    },
    [handleDeleteClick],
  );

  const handleEditorChange = useCallback(
    (value: Descendant[]) => {
      saveNoteContent(value);
    },
    [saveNoteContent],
  );

  const handleTitleChange = useCallback(
    (value: string) => {
      if (activeNoteId && value.trim()) {
        renameNote(activeNoteId, value.trim());
      }
    },
    [activeNoteId, renameNote],
  );

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
      <div className="flex h-12 flex-shrink-0 items-center border-b border-gray-100 px-4 dark:border-[#21262d]">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div
            ref={dropdownTriggerRef}
            className="flex cursor-pointer items-center gap-1 rounded px-1 py-1 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => setShowDropdown(!showDropdown)}
          >
            <ChevronDown size={16} className="shrink-0 opacity-60" />
          </div>

          <SelectDropDown<MenuItem>
            items={menuItems}
            selectedKey={`note-${activeNoteId}`}
            show={showDropdown}
            onClose={() => setShowDropdown(false)}
            onSelect={handleMenuSelect}
            triggerElement={dropdownTriggerRef.current}
            getKey={(item: MenuItem) => item.key}
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
              fontSize: "14px",
            }}
          />
        </EditorServicesProvider>
      </div>
    </div>
  );
}
