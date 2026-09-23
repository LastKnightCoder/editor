import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalStorageState } from "ahooks";
import classNames from "classnames";
import { FileText, Captions, Video } from "lucide-react";

import ResizablePanel from "@/components/ResizablePanel";
import LocalVideo from "@/components/LocalVideo";
import useThemeColors from "@/hooks/useThemeColors";
import BilibiliVideoLoader from "@/components/BilibiliVideoLoader";
import YoutubeVideoLoader from "@/components/YoutubeVideoLoader";
import RemoteVideoLoader from "@/components/RemoteVideoLoader";
import useSettingStore from "@/stores/useSettingStore";
import { getProjectItemById, getVideoNoteById } from "@/commands";
import {
  type VideoNote as IVideoNote,
  BiliBiliVideoMetaInfo,
  YouTubeVideoMetaInfo,
  RemoteVideoMetaInfo,
} from "@/types";
import { useBilibiliVideo } from "@/hooks/useBilibiliVideo";
import { useYoutubeVideo } from "@/hooks/useYoutubeVideo";
import { useRemoteVideo } from "@/hooks/useRemoteVideo";
import { shouldUseLocalVideoCache } from "@/utils/video";
import { buildWebVtt } from "./subtitle";
import {
  VIDEO_NOTE_AUTO_LANGUAGE,
  resolveVideoNoteOptimizationLanguage,
} from "@/components/VideoNotePanel/transcription-language";
import { useProjectContext } from "../ProjectContext";
import VideoNotePanel from "@/components/VideoNotePanel/VideoNotePanel";
import { toast } from "@tau/ui";

const SUBTITLE_MOUNTED_STORAGE_PREFIX = "video_note_subtitle_mounted_";

interface IVideoNoteViewProps {
  videoNoteId: number;
}

const VideoNoteView = ({ videoNoteId }: IVideoNoteViewProps) => {
  const autoCacheRemoteVideo = useSettingStore(state => state.setting.misc.video.autoCacheRemote);
  const { itemId: activeProjectItemId } = useProjectContext();
  const themeColors = useThemeColors();

  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [videoNote, setVideoNote] = useState<IVideoNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectItemTitle, setProjectItemTitle] = useState("");
  const [transcriptionLanguage, setTranscriptionLanguage] =
    useState<string>(VIDEO_NOTE_AUTO_LANGUAGE);
  const [subtitleMounted, setSubtitleMounted] = useLocalStorageState<boolean>(
    `${SUBTITLE_MOUNTED_STORAGE_PREFIX}${videoNoteId}`,
    { defaultValue: false }
  );
  const [subtitleTrackUrl, setSubtitleTrackUrl] = useState("");

  const {
    videoUrl: bilibiliVideoUrl,
    loading: bilibiliLoading,
    error: bilibiliError,
    streamProgress: bilibiliStreamProgress,
  } = useBilibiliVideo(videoNote?.metaInfo as BiliBiliVideoMetaInfo);
  const {
    videoUrl: youtubeVideoUrl,
    loading: youtubeLoading,
    error: youtubeError,
    streamProgress: youtubeStreamProgress,
  } = useYoutubeVideo(videoNote?.metaInfo as YouTubeVideoMetaInfo);
  const {
    videoUrl: remoteVideoUrl,
    loading: remoteLoading,
    error: remoteError,
    streamProgress: remoteStreamProgress,
  } = useRemoteVideo(
    videoNote?.metaInfo?.type === "remote"
      ? (videoNote.metaInfo as RemoteVideoMetaInfo).url
      : undefined
  );

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      setLoading(true);
      try {
        const note = await getVideoNoteById(videoNoteId);
        if (!mounted) {
          return;
        }
        if (!note) {
          toast.error("视频笔记不存在");
          setVideoNote(null);
          return;
        }
        setVideoNote(note);
      } catch (error) {
        console.error("Failed to load video note:", error);
        toast.error("加载失败");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      mounted = false;
    };
  }, [videoNoteId]);

  useEffect(() => {
    if (!activeProjectItemId) {
      setProjectItemTitle("");
      return;
    }

    void getProjectItemById(activeProjectItemId)
      .then(item => {
        setProjectItemTitle(item?.title || "");
      })
      .catch(error => {
        console.error("Failed to load project item:", error);
        setProjectItemTitle("");
      });
  }, [activeProjectItemId]);

  const setVideoRef = useCallback((element: HTMLVideoElement | null) => {
    videoElementRef.current = element;
    setVideoElement(element);
  }, []);

  const videoSrc = useMemo(() => {
    if (!videoNote) {
      return null;
    }
    const { metaInfo } = videoNote;

    switch (metaInfo.type) {
      case "local":
        return metaInfo.filePath;
      case "remote":
        return remoteVideoUrl;
      case "bilibili":
        return bilibiliVideoUrl;
      case "youtube":
        return youtubeVideoUrl;
      default:
        return null;
    }
  }, [videoNote, remoteVideoUrl, bilibiliVideoUrl, youtubeVideoUrl]);

  const videoLoading = useMemo(() => {
    if (!videoNote) {
      return true;
    }
    switch (videoNote.metaInfo.type) {
      case "bilibili":
        return bilibiliLoading;
      case "youtube":
        return youtubeLoading;
      case "remote":
        return remoteLoading;
      default:
        return false;
    }
  }, [videoNote, bilibiliLoading, youtubeLoading, remoteLoading]);

  const videoError = useMemo(() => {
    if (!videoNote) {
      return null;
    }
    switch (videoNote.metaInfo.type) {
      case "bilibili":
        return bilibiliError;
      case "youtube":
        return youtubeError;
      case "remote":
        return remoteError;
      default:
        return null;
    }
  }, [videoNote, bilibiliError, youtubeError, remoteError]);

  const useLocalVideo = useMemo(() => {
    if (!videoNote) {
      return false;
    }
    const { metaInfo } = videoNote;

    switch (metaInfo.type) {
      case "local":
        return true;
      case "remote":
        return shouldUseLocalVideoCache(metaInfo.url, autoCacheRemoteVideo);
      default:
        return false;
    }
  }, [videoNote, autoCacheRemoteVideo]);

  const subtitleLanguage = resolveVideoNoteOptimizationLanguage(transcriptionLanguage, null);
  const subtitleVttContent = useMemo(() => {
    const segments = videoNote?.transcriptSegments;
    if (!segments || segments.length === 0) {
      return "";
    }
    return buildWebVtt(segments, { minDurationMs: 500 });
  }, [videoNote?.transcriptSegments]);

  useEffect(() => {
    if (!subtitleMounted || !subtitleVttContent) {
      setSubtitleTrackUrl("");
      return;
    }

    const url = URL.createObjectURL(new Blob([subtitleVttContent], { type: "text/vtt" }));
    setSubtitleTrackUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [subtitleMounted, subtitleVttContent]);

  const renderVideoLoader = () => {
    if (!videoNote) {
      return null;
    }

    switch (videoNote.metaInfo.type) {
      case "bilibili":
        return (
          <BilibiliVideoLoader
            loading={bilibiliLoading}
            error={bilibiliError}
            streamProgress={bilibiliStreamProgress}
          />
        );
      case "youtube":
        return (
          <YoutubeVideoLoader
            loading={youtubeLoading}
            error={youtubeError}
            streamProgress={youtubeStreamProgress}
          />
        );
      case "remote":
        return (
          <RemoteVideoLoader
            loading={remoteLoading}
            error={remoteError}
            streamProgress={remoteStreamProgress}
          />
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4">
        <div className="relative h-10 w-10">
          <span className="absolute inset-0 rounded-full border-2 border-gray-200 dark:border-slate-700" />
          <span
            className={classNames(
              "absolute inset-0 animate-spin rounded-full border-2 border-transparent",
              themeColors.iconTextClass
            )}
            style={{ borderTopColor: "currentColor" }}
          />
        </div>
        <span className={classNames("text-sm", themeColors.secondaryTextClass)}>加载中...</span>
      </div>
    );
  }

  if (!videoNote) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-8 text-center">
        <div
          className={classNames(
            "flex h-14 w-14 items-center justify-center rounded-2xl",
            themeColors.iconBgClass,
            themeColors.iconTextClass
          )}
        >
          <Video className="size-[26px]" strokeWidth={1.75} />
        </div>
        <p className={classNames("text-sm font-medium", themeColors.textClass)}>视频笔记不存在</p>
        <p className={classNames("text-xs", themeColors.secondaryTextClass)}>
          该笔记可能已被删除或加载异常
        </p>
      </div>
    );
  }

  const subtitleTrackElement =
    subtitleMounted && subtitleTrackUrl ? (
      <track
        key={subtitleTrackUrl}
        kind="subtitles"
        src={subtitleTrackUrl}
        srcLang={subtitleLanguage}
        label="转录字幕"
        default
      />
    ) : null;

  const sourceLabels: Record<string, string> = {
    local: "本地视频",
    remote: "远程视频",
    bilibili: "哔哩哔哩",
    youtube: "YouTube",
  };
  const sourceLabel = videoNote ? (sourceLabels[videoNote.metaInfo.type] ?? "视频") : "视频";
  const transcriptCount = videoNote?.transcriptSegments?.length ?? 0;
  const hasSummary = !!videoNote?.summary;
  // 视频就绪前容器用主题化背景，避免下载/错误态在亮色模式下出现黑底
  const showVideo = !videoLoading && !videoError && !!videoSrc;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex-1 overflow-hidden">
        <ResizablePanel
          id="video-note-view"
          initialLeftRatio={0.55}
          minLeft={300}
          minRight={400}
          left={
            <div className="flex h-full flex-col overflow-y-auto">
              <div className="mx-auto w-full max-w-[960px] p-4">
                <div
                  className={classNames(
                    "relative w-full overflow-hidden rounded-xl",
                    showVideo ? "bg-black" : "bg-gray-100 dark:bg-zinc-900"
                  )}
                  style={{
                    aspectRatio: "16/9",
                    boxShadow: "0 10px 30px -10px rgba(0,0,0,0.3)",
                  }}
                >
                  {renderVideoLoader()}

                  {showVideo && (
                    <>
                      {useLocalVideo ? (
                        <LocalVideo
                          ref={setVideoRef}
                          src={videoSrc}
                          controls
                          crossOrigin="anonymous"
                          className="absolute inset-0 h-full w-full object-contain"
                        >
                          {subtitleTrackElement}
                        </LocalVideo>
                      ) : (
                        <video
                          ref={setVideoRef}
                          src={videoSrc}
                          controls
                          crossOrigin="anonymous"
                          className="absolute inset-0 h-full w-full object-contain"
                        >
                          {subtitleTrackElement}
                        </video>
                      )}
                    </>
                  )}
                </div>

                <div className="mt-4 rounded-xl border border-gray-200 bg-white/60 p-4 dark:border-slate-700 dark:bg-white/5">
                  <h2 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
                    {projectItemTitle || videoNote?.description || "未命名视频"}
                  </h2>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-white/10 dark:text-gray-300">
                      <Video className="size-3" strokeWidth={1.75} />
                      {sourceLabel}
                    </span>
                    <span
                      className={classNames(
                        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs",
                        transcriptCount > 0
                          ? "bg-[var(--th-success)]/10 text-status-success"
                          : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"
                      )}
                    >
                      <Captions className="size-3" strokeWidth={1.75} />
                      {transcriptCount > 0 ? `已转录 ${transcriptCount} 段` : "未转录"}
                    </span>
                    <span
                      className={classNames(
                        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs",
                        hasSummary
                          ? "dark:bg-[var(--th-accent)]/15 bg-[var(--th-accent-soft)] text-[var(--th-active-text)]"
                          : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"
                      )}
                    >
                      <FileText className="size-3" strokeWidth={1.75} />
                      {hasSummary ? "已总结" : "未总结"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          }
          right={
            <VideoNotePanel
              videoNoteId={videoNoteId}
              externalVideoElement={videoElement}
              videoTitle={projectItemTitle || videoNote.description}
              transcriptionLanguage={transcriptionLanguage}
              onTranscriptionLanguageChange={setTranscriptionLanguage}
              onVideoNoteChange={setVideoNote}
              subtitleMounted={subtitleMounted ?? false}
              onSubtitleMountedChange={setSubtitleMounted}
            />
          }
        />
      </div>
    </div>
  );
};

export default VideoNoteView;
