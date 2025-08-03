import { useEffect, useState } from "react";
import { type VideoNote as IVideoNote, BiliBiliVideoMetaInfo } from "@/types";
import VideoNote from "@/components/VideoNote";
import BilibiliVideoLoader from "@/components/BilibiliVideoLoader";
import styles from "./index.module.less";
import useUploadResource from "@/hooks/useUploadResource.ts";
import { useBilibiliVideo } from "@/hooks/useBilibiliVideo";
import { useVideoNoteOperations } from "@/hooks/useVideoNoteOperations";

interface IVideoNoteViewProps {
  videoNoteId: number;
}

const VideoNoteView = ({ videoNoteId }: IVideoNoteViewProps) => {
  const [videoNote, setVideoNote] = useState<IVideoNote | null>(null);
  const uploadResource = useUploadResource();

  // 使用 Bilibili 视频处理 hook
  const {
    videoUrl: bilibiliVideoUrl,
    loading: bilibiliLoading,
    error: bilibiliError,
    streamProgress,
  } = useBilibiliVideo(videoNote?.metaInfo as BiliBiliVideoMetaInfo);

  const {
    refreshVideoNote,
    updateNotes,
    handleAddSubNote,
    handleDeleteSubNote,
    handleUpdateSubNote,
  } = useVideoNoteOperations(videoNoteId, videoNote, setVideoNote);

  useEffect(() => {
    refreshVideoNote();
  }, [videoNoteId]);

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
  } else if (videoNote.metaInfo.type === "bilibili") {
    return (
      <div className={styles.container}>
        <BilibiliVideoLoader
          loading={bilibiliLoading}
          error={bilibiliError}
          streamProgress={streamProgress}
        />

        {bilibiliVideoUrl && !bilibiliLoading && !bilibiliError && (
          <VideoNote
            videoSrc={bilibiliVideoUrl}
            initialNotes={videoNote.notes}
            uploadResource={uploadResource}
            addSubNote={handleAddSubNote}
            deleteSubNote={handleDeleteSubNote}
            updateSubNote={handleUpdateSubNote}
            updateNotes={updateNotes}
          />
        )}
      </div>
    );
  }

  return null;
};

export default VideoNoteView;
