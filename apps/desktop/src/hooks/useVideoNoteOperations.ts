import { useMemoizedFn } from "ahooks";
import { type VideoNote as IVideoNote } from "@/types";
import { getVideoNoteById } from "@/commands";

export interface UseVideoNoteOperationsResult {
  refreshVideoNote: (videoNoteId: number) => Promise<void>;
}

export function useVideoNoteOperations(
  setVideoNote: (videoNote: IVideoNote | null) => void,
): UseVideoNoteOperationsResult {
  const refreshVideoNote = useMemoizedFn(async (videoNoteId: number) => {
    const videoNote = await getVideoNoteById(videoNoteId);
    setVideoNote(videoNote);
  });

  return {
    refreshVideoNote,
  };
}
