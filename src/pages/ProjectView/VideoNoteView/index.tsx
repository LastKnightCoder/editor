import { useEffect, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { type VideoNote as IVideoNote } from "@/types";
import {
  getVideoNoteById,
  updateVideoNote,
  addSubNote,
  deleteSubNote,
  updateSubNote,
} from "@/commands";
import VideoNote from "@/components/VideoNote";
import styles from "./index.module.less";
import useUploadResource from "@/hooks/useUploadResource.ts";

interface IVideoNoteViewProps {
  videoNoteId: number;
}

const VideoNoteView = ({ videoNoteId }: IVideoNoteViewProps) => {
  const [videoNote, setVideoNote] = useState<IVideoNote | null>(null);
  const uploadResource = useUploadResource();

  const refreshVideoNote = useMemoizedFn(async () => {
    const videoNote = await getVideoNoteById(videoNoteId);
    setVideoNote(videoNote);
  });

  useEffect(() => {
    refreshVideoNote();
  }, [videoNoteId]);

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

  if (!videoNote) return null;

  if (videoNote.metaInfo.type === "local") {
    return (
      <div className={styles.container}>
        <VideoNote
          videoSrc={videoNote.metaInfo.filePath}
          initialNotes={videoNote.notes}
          uploadResource={uploadResource}
          addSubNote={handleAddSubNote}
          deleteSubNote={handleDeleteSubNote}
          updateSubNote={handleUpdateSubNote}
          updateNotes={updateNotes}
        />
      </div>
    );
  } else if (videoNote.metaInfo.type === "remote") {
    return (
      <div className={styles.container}>
        <VideoNote
          videoSrc={videoNote.metaInfo.url}
          initialNotes={videoNote.notes}
          uploadResource={uploadResource}
          addSubNote={handleAddSubNote}
          deleteSubNote={handleDeleteSubNote}
          updateSubNote={handleUpdateSubNote}
          updateNotes={updateNotes}
        />
      </div>
    );
  }

  return null;
};

export default VideoNoteView;
