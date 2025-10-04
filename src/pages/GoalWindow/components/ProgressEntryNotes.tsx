import { useEffect, useState, memo } from "react";
import { App } from "antd";
import { useMemoizedFn } from "ahooks";
import {
  listGoalProgressNotes,
  detachGoalProgressNote,
  updateGoalProgressNoteTitle,
  updateGoalProgressNoteType,
} from "@/commands/goal-progress-note";
import NotesList, { NoteItem } from "./NotesList";

interface ProgressEntryNotesProps {
  goalProgressEntryId: number | null;
  readonly?: boolean;
  className?: string;
}

const ProgressEntryNotes: React.FC<ProgressEntryNotesProps> = memo(
  ({ goalProgressEntryId, readonly = false, className }) => {
    const { message } = App.useApp();
    const [notes, setNotes] = useState<NoteItem[]>([]);

    const loadNotes = useMemoizedFn(async () => {
      if (!goalProgressEntryId) {
        setNotes([]);
        return;
      }

      try {
        const noteList = await listGoalProgressNotes(goalProgressEntryId);
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
    }, [goalProgressEntryId, loadNotes]);

    const handleDelete = useMemoizedFn(async (noteId: number) => {
      await detachGoalProgressNote(noteId);
      await loadNotes();
    });

    const handleUpdateTitle = useMemoizedFn(
      async (noteId: number, title: string) => {
        await updateGoalProgressNoteTitle(noteId, title);
        await loadNotes();
      },
    );

    const handleUpdateType = useMemoizedFn(
      async (noteId: number, type: string) => {
        await updateGoalProgressNoteType(noteId, type);
        await loadNotes();
      },
    );

    if (!goalProgressEntryId) {
      return null;
    }

    return (
      <NotesList
        notes={notes}
        readonly={readonly}
        showCreateTime={true}
        className={className}
        onDelete={handleDelete}
        onUpdateTitle={handleUpdateTitle}
        onUpdateType={handleUpdateType}
        onRefresh={loadNotes}
      />
    );
  },
);

ProgressEntryNotes.displayName = "ProgressEntryNotes";

export default ProgressEntryNotes;
