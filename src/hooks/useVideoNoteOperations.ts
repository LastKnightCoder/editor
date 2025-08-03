import { useMemoizedFn } from "ahooks";
import { type VideoNote as IVideoNote } from "@/types";
import {
  getVideoNoteById,
  updateVideoNote,
  addSubNote,
  deleteSubNote,
  updateSubNote,
} from "@/commands";

export interface UseVideoNoteOperationsResult {
  refreshVideoNote: () => Promise<void>;
  updateNotes: (notes: IVideoNote["notes"]) => Promise<void>;
  handleAddSubNote: (
    note: Omit<IVideoNote["notes"][number], "contentId">,
  ) => Promise<any>;
  handleDeleteSubNote: (noteId: string) => Promise<any>;
  handleUpdateSubNote: (note: IVideoNote["notes"][number]) => Promise<any>;
}

export function useVideoNoteOperations(
  videoNoteId: number,
  videoNote: IVideoNote | null,
  setVideoNote: (videoNote: IVideoNote | null) => void,
): UseVideoNoteOperationsResult {
  const refreshVideoNote = useMemoizedFn(async () => {
    const videoNote = await getVideoNoteById(videoNoteId);
    setVideoNote(videoNote);
  });

  const updateNotes = useMemoizedFn(async (notes: IVideoNote["notes"]) => {
    if (!videoNote) return;
    const newVideoNote = {
      ...videoNote,
      notes: notes.map((note) => ({
        id: note.id,
        startTime: note.startTime,
        contentId: note.contentId,
      })),
    };
    const updatedVideoNote = await updateVideoNote(newVideoNote);
    setVideoNote(updatedVideoNote);
  });

  const handleAddSubNote = useMemoizedFn(
    async (note: Omit<IVideoNote["notes"][number], "contentId">) => {
      const res = await addSubNote(videoNoteId, note);
      refreshVideoNote();
      return res;
    },
  );

  const handleDeleteSubNote = useMemoizedFn(async (noteId: string) => {
    const res = await deleteSubNote(videoNoteId, noteId);
    refreshVideoNote();
    return res;
  });

  const handleUpdateSubNote = useMemoizedFn(
    async (note: IVideoNote["notes"][number]) => {
      const res = await updateSubNote(note);
      refreshVideoNote();
      return res;
    },
  );

  return {
    refreshVideoNote,
    updateNotes,
    handleAddSubNote,
    handleDeleteSubNote,
    handleUpdateSubNote,
  };
}
