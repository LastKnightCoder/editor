import { useEffect, useState, memo } from "react";
import { App } from "antd";
import { useMemoizedFn } from "ahooks";
import {
  listGoalNotes,
  detachGoalNote,
  updateGoalNoteTitle,
  updateGoalNoteType,
} from "@/commands/goal-note";
import NotesList, { NoteItem } from "./NotesList";

interface GoalItemNotesProps {
  goalId: number;
  readonly?: boolean;
  className?: string;
}

const GoalItemNotes: React.FC<GoalItemNotesProps> = memo(
  ({ goalId, readonly = false, className }) => {
    const { message } = App.useApp();
    const [notes, setNotes] = useState<NoteItem[]>([]);

    const loadNotes = useMemoizedFn(async () => {
      if (!goalId) {
        setNotes([]);
        return;
      }

      try {
        const noteList = await listGoalNotes(goalId);
        setNotes(
          noteList.map((note) => ({
            id: note.id,
            contentId: note.contentId,
            title: note.title,
            type: note.type,
            createTime: note.createTime,
          })),
        );
      } catch (error) {
        console.error("加载笔记失败:", error);
        message.error("加载笔记失败");
      }
    });

    useEffect(() => {
      loadNotes();
    }, [goalId, loadNotes]);

    const handleDelete = useMemoizedFn(async (noteId: number) => {
      await detachGoalNote(noteId);
      await loadNotes();
    });

    const handleUpdateTitle = useMemoizedFn(
      async (noteId: number, title: string) => {
        await updateGoalNoteTitle(noteId, title);
        await loadNotes();
      },
    );

    const handleUpdateType = useMemoizedFn(
      async (noteId: number, type: string) => {
        await updateGoalNoteType(noteId, type);
        await loadNotes();
      },
    );

    return (
      <NotesList
        notes={notes}
        readonly={readonly}
        showCreateTime={false}
        className={className}
        onDelete={handleDelete}
        onUpdateTitle={handleUpdateTitle}
        onUpdateType={handleUpdateType}
        onRefresh={loadNotes}
      />
    );
  },
);

GoalItemNotes.displayName = "GoalItemNotes";

export default GoalItemNotes;
