import { useEffect, useState } from "react";
import {
  type VideoNote as IVideoNote,
  BiliBiliVideoMetaInfo,
  YouTubeVideoMetaInfo,
  NotionVideoMetaInfo,
} from "@/types";
import VideoNote from "@/components/VideoNote";
import BilibiliVideoLoader from "@/components/BilibiliVideoLoader";
import YoutubeVideoLoader from "@/components/YoutubeVideoLoader";
import NotionVideoLoader from "@/components/NotionVideoLoader";
import useUploadResource from "@/hooks/useUploadResource.ts";
import { useBilibiliVideo } from "@/hooks/useBilibiliVideo";
import { useYoutubeVideo } from "@/hooks/useYoutubeVideo";
import { useNotionVideo } from "@/hooks/useNotionVideo";
import { useVideoNoteOperations } from "@/hooks/useVideoNoteOperations";

interface IVideoNoteViewProps {
  videoNoteId: number;
}

const VideoNoteView = ({ videoNoteId }: IVideoNoteViewProps) => {
  const [videoNote, setVideoNote] = useState<IVideoNote | null>(null);
  const uploadResource = useUploadResource();

  const {
    videoUrl: bilibiliVideoUrl,
    loading: bilibiliLoading,
    error: bilibiliError,
    streamProgress,
  } = useBilibiliVideo(videoNote?.metaInfo as BiliBiliVideoMetaInfo);

  const {
    videoUrl: youtubeVideoUrl,
    loading: youtubeLoading,
    error: youtubeError,
    streamProgress: youtubeStreamProgress,
  } = useYoutubeVideo(videoNote?.metaInfo as YouTubeVideoMetaInfo);

  const {
    videoUrl: notionVideoUrl,
    loading: notionLoading,
    error: notionError,
    streamProgress: notionStreamProgress,
  } = useNotionVideo(videoNote?.metaInfo as NotionVideoMetaInfo);

  const {
    refreshVideoNote,
    updateNotes,
    handleAddSubNote,
    handleDeleteSubNote,
  } = useVideoNoteOperations(videoNoteId, videoNote, setVideoNote);

  useEffect(() => {
    refreshVideoNote(videoNoteId);
  }, [refreshVideoNote, videoNoteId]);

  if (!videoNote) return null;

  if (videoNote.metaInfo.type === "local") {
    return (
      <div className="h-full w-full">
        <VideoNote
          videoSrc={videoNote.metaInfo.filePath}
          initialNotes={videoNote.notes}
          uploadResource={uploadResource}
          addSubNote={handleAddSubNote}
          deleteSubNote={handleDeleteSubNote}
          updateNotes={updateNotes}
        />
      </div>
    );
  } else if (videoNote.metaInfo.type === "remote") {
    return (
      <div className="h-full w-full">
        <VideoNote
          videoSrc={videoNote.metaInfo.url}
          initialNotes={videoNote.notes}
          uploadResource={uploadResource}
          addSubNote={handleAddSubNote}
          deleteSubNote={handleDeleteSubNote}
          updateNotes={updateNotes}
        />
      </div>
    );
  } else if (videoNote.metaInfo.type === "bilibili") {
    return (
      <div className="h-full w-full">
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
            updateNotes={updateNotes}
          />
        )}
      </div>
    );
  }

  if (videoNote.metaInfo.type === "youtube") {
    return (
      <div className="h-full w-full">
        <YoutubeVideoLoader
          loading={youtubeLoading}
          error={youtubeError}
          streamProgress={youtubeStreamProgress}
        />
        {youtubeVideoUrl && !youtubeLoading && !youtubeError && (
          <VideoNote
            videoSrc={youtubeVideoUrl}
            initialNotes={videoNote.notes}
            uploadResource={uploadResource}
            addSubNote={handleAddSubNote}
            deleteSubNote={handleDeleteSubNote}
            updateNotes={updateNotes}
          />
        )}
      </div>
    );
  }

  if (videoNote.metaInfo.type === "notion") {
    const notionMeta = videoNote.metaInfo as NotionVideoMetaInfo;
    const useLocalVideo = notionMeta.cache !== false; // 默认使用 LocalVideo，只有明确设置为 false 时才使用普通 video

    return (
      <div className="h-full w-full">
        <NotionVideoLoader
          loading={notionLoading}
          error={notionError}
          streamProgress={notionStreamProgress}
        />
        {notionVideoUrl && !notionLoading && !notionError && (
          <VideoNote
            videoSrc={notionVideoUrl}
            initialNotes={videoNote.notes}
            uploadResource={uploadResource}
            addSubNote={handleAddSubNote}
            deleteSubNote={handleDeleteSubNote}
            updateNotes={updateNotes}
            useLocalVideo={useLocalVideo}
          />
        )}
      </div>
    );
  }

  return null;
};

export default VideoNoteView;
