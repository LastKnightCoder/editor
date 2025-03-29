import { useEffect, useState } from "react";
import { useDebounceFn } from "ahooks";
import { type VideoNote as IVideoNote } from "@/types";
import { getVideoNoteById, updateVideoNote } from "@/commands";
import VideoNote from "@/components/VideoNote";
import styles from "./index.module.less";

interface IVideoNoteViewProps {
  videoNoteId: number;
}

const VideoNoteView = ({ videoNoteId }: IVideoNoteViewProps) => {
  const [videoNote, setVideoNote] = useState<IVideoNote | null>(null);

  useEffect(() => {
    getVideoNoteById(videoNoteId).then((videoNote) => {
      setVideoNote(videoNote);
    });
  }, [videoNoteId]);

  const { run: handleNotesChange } = useDebounceFn(
    (notes: IVideoNote["notes"]) => {
      if (!videoNote) return;
      const newVideoNote: IVideoNote = {
        ...videoNote,
        notes,
      };
      updateVideoNote(newVideoNote);
    },
    { wait: 200 },
  );

  if (!videoNote || videoNote.metaInfo.type !== "local") return null;

  return (
    <div className={styles.container}>
      <VideoNote
        videoSrc={videoNote.metaInfo.filePath}
        initialNotes={videoNote.notes}
        onNotesChange={handleNotesChange}
      />
    </div>
  );
};

export default VideoNoteView;
