import { useMemoizedFn } from "ahooks";
import { type VideoNote as IVideoNote } from "@/types";
import {
  getVideoNoteById,
  updateVideoNote,
  addSubNote,
  deleteSubNote,
} from "@/commands";

export interface UseVideoNoteOperationsResult {
  refreshVideoNote: (videoNoteId: number) => Promise<void>;
  updateNotes: (notes: IVideoNote["notes"]) => Promise<void>;
  handleAddSubNote: (
    note: Omit<IVideoNote["notes"][number], "contentId">,
  ) => Promise<IVideoNote["notes"][number] | null>;
  handleDeleteSubNote: (noteId: string) => Promise<boolean>;
}

export function useVideoNoteOperations(
  videoNoteId: number,
  videoNote: IVideoNote | null,
  setVideoNote: (videoNote: IVideoNote | null) => void,
): UseVideoNoteOperationsResult {
  const refreshVideoNote = useMemoizedFn(async (videoNoteId: number) => {
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
      refreshVideoNote(videoNoteId);
      return res;
    },
  );

  const handleDeleteSubNote = useMemoizedFn(async (noteId: string) => {
    const res = await deleteSubNote(videoNoteId, noteId);
    refreshVideoNote(videoNoteId);
    return res;
  });

  return {
    refreshVideoNote,
    updateNotes,
    handleAddSubNote,
    handleDeleteSubNote,
  };
}
