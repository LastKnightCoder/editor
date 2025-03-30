import { useEffect, useState } from "react";
import { useDebounceFn } from "ahooks";
import { type VideoNote as IVideoNote } from "@/types";
import { getVideoNoteById, updateVideoNote } from "@/commands";
import VideoNote from "@/components/VideoNote";
import styles from "./index.module.less";
import useUploadResource from "@/hooks/useUploadResource.ts";

interface IVideoNoteViewProps {
  videoNoteId: number;
}

const VideoNoteView = ({ videoNoteId }: IVideoNoteViewProps) => {
  const [videoNote, setVideoNote] = useState<IVideoNote | null>(null);
  const uploadResource = useUploadResource();

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

  if (!videoNote) return null;

  if (videoNote.metaInfo.type === "local") {
    return (
      <div className={styles.container}>
        <VideoNote
          videoSrc={videoNote.metaInfo.filePath}
          initialNotes={videoNote.notes}
          onNotesChange={handleNotesChange}
          uploadResource={uploadResource}
        />
      </div>
    );
  } else if (videoNote.metaInfo.type === "remote") {
    return (
      <div className={styles.container}>
        <VideoNote
          videoSrc={videoNote.metaInfo.url}
          initialNotes={videoNote.notes}
          onNotesChange={handleNotesChange}
          uploadResource={uploadResource}
        />
      </div>
    );
  }

  return null;
};

export default VideoNoteView;
