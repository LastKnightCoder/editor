import { useEffect, useState, useMemo } from "react";
import { useTodoStore } from "@/stores/useTodoStore";
import { App, Dropdown } from "antd";
import { MdAdd } from "react-icons/md";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import RichTextEditModal from "@/components/RichTextEditModal";
import { IndexType, SearchResult, TodoNoteLink } from "@/types";
import { IExtension } from "@/components/Editor";
import { useMemoizedFn } from "ahooks";
import NoteCard from "./NoteCard";

const selectNotes = [
  "card",
  "article",
  "project-item",
  "document-item",
] satisfies IndexType[];
const extensions = [] satisfies IExtension[];

const TodoNotesDnd = ({ todoId }: { todoId: number }) => {
  const {
    notesByTodoId,
    loadNotes,
    attachExistingNote,
    createAndAttachNote,
    detachNote,
    reorderNotes,
    updateNoteTitleSnapshot,
  } = useTodoStore();
  const notes = useMemo(
    () => notesByTodoId[todoId] || [],
    [notesByTodoId, todoId],
  );
  const { message } = App.useApp();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingContentId, setEditingContentId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [localNotes, setLocalNotes] = useState(notes);

  const { modal } = App.useApp();

  useEffect(() => {
    loadNotes(todoId);
  }, [todoId]);

  useEffect(() => {
    setLocalNotes(notes);
  }, [notes]);

  const moveNote = useMemoizedFn((dragIndex: number, hoverIndex: number) => {
    const newNotes = [...localNotes];
    const [removed] = newNotes.splice(dragIndex, 1);
    newNotes.splice(hoverIndex, 0, removed);
    setLocalNotes(newNotes);

    const ids = newNotes.map((n) => n.id);
    reorderNotes(todoId, ids);
  });

  const handleEdit = useMemoizedFn((note: TodoNoteLink) => {
    setEditingContentId(note.contentId);
    setEditingTitle(note.title || "未命名文档");
    setEditModalOpen(true);
  });

  const handleTitleChange = useMemoizedFn((newTitle: string) => {
    if (editingContentId) {
      const note = notes.find((n) => n.contentId === editingContentId);
      if (note) {
        updateNoteTitleSnapshot(note.id, newTitle);
      }
    }
  });

  const handleSelectNote = useMemoizedFn(
    async (item: SearchResult | SearchResult[]) => {
      const first = Array.isArray(item) ? item[0] : item;
      if (!first) return;
      await attachExistingNote(
        todoId,
        first.contentId,
        first.title || "",
        first.type,
      );
      message.success("已关联笔记");
      setSelectorOpen(false);
    },
  );

  const excludeContentIds = useMemo(() => {
    return notes.map((n) => n.contentId);
  }, [notes]);

  const handleCancelCreateAndAttachNote = useMemoizedFn(() => {
    setSelectorOpen(false);
  });

  const handleCancelEdit = useMemoizedFn(() => {
    setEditModalOpen(false);
    setEditingContentId(null);
    setEditingTitle("");
  });

  const items = useMemo(() => {
    return [
      {
        label: "关联笔记",
        key: "attach-existing",
        onClick: () => setSelectorOpen(true),
      },
      {
        label: "新建笔记",
        key: "create-and-attach",
        onClick: async () => {
          await createAndAttachNote(todoId, "未命名文档");
          message.success("已创建并关联");
          setSelectorOpen(false);
        },
      },
    ];
  }, [notes, createAndAttachNote, attachExistingNote]);

  const handleDetachNote = useMemoizedFn((noteId: number) => {
    modal.confirm({
      title: "确定删除该笔记吗？",
      onOk: () => {
        detachNote(noteId);
      },
      okText: "确定",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
    });
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-xs opacity-60">关联笔记</div>
        <Dropdown menu={{ items }} trigger={["click"]}>
          <div className="px-1 py-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
            <MdAdd />
          </div>
        </Dropdown>
      </div>

      <div className="flex flex-wrap gap-2">
        {localNotes.map((note, index) => (
          <NoteCard
            key={note.id}
            note={note}
            index={index}
            moveNote={moveNote}
            onEdit={handleEdit.bind(null, note)}
            onDelete={handleDetachNote.bind(null, note.id)}
          />
        ))}
      </div>

      <ContentSelectorModal
        open={selectorOpen}
        onCancel={handleCancelCreateAndAttachNote}
        onSelect={handleSelectNote}
        contentType={selectNotes}
        extensions={extensions}
        title="选择要关联的文档"
        emptyDescription="未找到相关文档"
        multiple={false}
        excludeContentIds={excludeContentIds}
      />

      {editingContentId && (
        <RichTextEditModal
          visible={editModalOpen}
          contentId={editingContentId}
          title={editingTitle}
          onClose={handleCancelEdit}
          onTitleChange={handleTitleChange}
        />
      )}
    </div>
  );
};

export default TodoNotesDnd;
