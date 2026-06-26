import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GlobalOutlined } from "@ant-design/icons";
import { App, Empty, Select, Spin, Tooltip } from "antd";
import { useLocalStorageState } from "ahooks";

import ResizablePanel from "@/components/ResizablePanel";
import LocalVideo from "@/components/LocalVideo";
import BilibiliVideoLoader from "@/components/BilibiliVideoLoader";
import YoutubeVideoLoader from "@/components/YoutubeVideoLoader";
import NotionVideoLoader from "@/components/NotionVideoLoader";
import RemoteVideoLoader from "@/components/RemoteVideoLoader";
import useSettingStore from "@/stores/useSettingStore";
import { getProjectItemById, getVideoNoteById } from "@/commands";
import {
  type VideoNote as IVideoNote,
  BiliBiliVideoMetaInfo,
  YouTubeVideoMetaInfo,
  NotionVideoMetaInfo,
  RemoteVideoMetaInfo,
} from "@/types";
import { useBilibiliVideo } from "@/hooks/useBilibiliVideo";
import { useYoutubeVideo } from "@/hooks/useYoutubeVideo";
import { useNotionVideo } from "@/hooks/useNotionVideo";
import { useRemoteVideo } from "@/hooks/useRemoteVideo";
import { shouldUseLocalVideoCache } from "@/utils/video";
import { buildWebVtt } from "./subtitle";
import {
  VIDEO_NOTE_AUTO_LANGUAGE,
  resolveVideoNoteOptimizationLanguage,
} from "./transcription-language";
import { useProjectContext } from "../ProjectContext";
import VideoNotePanel from "./VideoNotePanel";

const TRANSCRIPTION_LANGUAGES = [
  { value: VIDEO_NOTE_AUTO_LANGUAGE, label: "自动识别 (Auto Detect)" },
  { value: "zh", label: "中文 (Chinese)" },
  { value: "en", label: "英语 (English)" },
  { value: "ja", label: "日语 (Japanese)" },
  { value: "ko", label: "韩语 (Korean)" },
  { value: "fr", label: "法语 (French)" },
  { value: "de", label: "德语 (German)" },
  { value: "es", label: "西班牙语 (Spanish)" },
  { value: "ru", label: "俄语 (Russian)" },
  { value: "it", label: "意大利语 (Italian)" },
  { value: "pt", label: "葡萄牙语 (Portuguese)" },
  { value: "ar", label: "阿拉伯语 (Arabic)" },
  { value: "hi", label: "印地语 (Hindi)" },
];

const SUBTITLE_MOUNTED_STORAGE_PREFIX = "video_note_subtitle_mounted_";

interface IVideoNoteViewProps {
  videoNoteId: number;
}

const VideoNoteView = ({ videoNoteId }: IVideoNoteViewProps) => {
  const { message } = App.useApp();
  const autoCacheRemoteVideo = useSettingStore(
    (state) => state.setting.misc.video.autoCacheRemote,
  );
  const { itemId: activeProjectItemId } = useProjectContext();

  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(
    null,
  );
  const [videoNote, setVideoNote] = useState<IVideoNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectItemTitle, setProjectItemTitle] = useState("");
  const [transcriptionLanguage, setTranscriptionLanguage] = useState<string>(
    VIDEO_NOTE_AUTO_LANGUAGE,
  );
  const [subtitleMounted, setSubtitleMounted] = useLocalStorageState<boolean>(
    `${SUBTITLE_MOUNTED_STORAGE_PREFIX}${videoNoteId}`,
    { defaultValue: false },
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
    videoUrl: notionVideoUrl,
    loading: notionLoading,
    error: notionError,
    streamProgress: notionStreamProgress,
  } = useNotionVideo(videoNote?.metaInfo as NotionVideoMetaInfo);
  const {
    videoUrl: remoteVideoUrl,
    loading: remoteLoading,
    error: remoteError,
    streamProgress: remoteStreamProgress,
  } = useRemoteVideo(
    videoNote?.metaInfo?.type === "remote"
      ? (videoNote.metaInfo as RemoteVideoMetaInfo).url
      : undefined,
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
          message.error("视频笔记不存在");
          setVideoNote(null);
          return;
        }
        setVideoNote(note);
      } catch (error) {
        console.error("Failed to load video note:", error);
        message.error("加载失败");
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
  }, [videoNoteId, message]);

  useEffect(() => {
    if (!activeProjectItemId) {
      setProjectItemTitle("");
      return;
    }

    void getProjectItemById(activeProjectItemId)
      .then((item) => {
        setProjectItemTitle(item?.title || "");
      })
      .catch((error) => {
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
      case "notion":
        return notionVideoUrl;
      default:
        return null;
    }
  }, [
    videoNote,
    remoteVideoUrl,
    bilibiliVideoUrl,
    youtubeVideoUrl,
    notionVideoUrl,
  ]);

  const videoLoading = useMemo(() => {
    if (!videoNote) {
      return true;
    }
    switch (videoNote.metaInfo.type) {
      case "bilibili":
        return bilibiliLoading;
      case "youtube":
        return youtubeLoading;
      case "notion":
        return notionLoading;
      case "remote":
        return remoteLoading;
      default:
        return false;
    }
  }, [
    videoNote,
    bilibiliLoading,
    youtubeLoading,
    notionLoading,
    remoteLoading,
  ]);

  const videoError = useMemo(() => {
    if (!videoNote) {
      return null;
    }
    switch (videoNote.metaInfo.type) {
      case "bilibili":
        return bilibiliError;
      case "youtube":
        return youtubeError;
      case "notion":
        return notionError;
      case "remote":
        return remoteError;
      default:
        return null;
    }
  }, [videoNote, bilibiliError, youtubeError, notionError, remoteError]);

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
      case "notion":
        return (metaInfo as NotionVideoMetaInfo).cache !== false;
      default:
        return false;
    }
  }, [videoNote, autoCacheRemoteVideo]);

  const hasTranscriptSegments = !!videoNote?.transcriptSegments?.length;
  const subtitleTooltipTitle = !hasTranscriptSegments
    ? "请先转录后再挂载字幕"
    : subtitleMounted
      ? "已挂载字幕（可关闭）"
      : "挂载字幕";
  const subtitleLanguage = resolveVideoNoteOptimizationLanguage(
    transcriptionLanguage,
    null,
  );
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

    const url = URL.createObjectURL(
      new Blob([subtitleVttContent], { type: "text/vtt" }),
    );
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
      case "notion":
        return (
          <NotionVideoLoader
            loading={notionLoading}
            error={notionError}
            streamProgress={notionStreamProgress}
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
      <div className="flex h-full w-full items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!videoNote) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Empty description="视频笔记不存在" />
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

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-12 shrink-0 items-center justify-end border-b border-gray-200 px-4 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <GlobalOutlined className="text-base text-gray-600 dark:text-gray-300" />
            <Select
              value={transcriptionLanguage}
              onChange={setTranscriptionLanguage}
              options={TRANSCRIPTION_LANGUAGES}
              className="w-52"
              popupMatchSelectWidth={false}
              placeholder="选择转录语言"
            />
          </div>

          <Tooltip title={subtitleTooltipTitle}>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!hasTranscriptSegments}
              onClick={() => setSubtitleMounted(!subtitleMounted)}
            >
              <span
                className={`text-xs font-semibold leading-none ${
                  subtitleMounted ? "text-blue-500 dark:text-blue-400" : ""
                }`}
              >
                字
              </span>
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ResizablePanel
          id="video-note-view"
          initialLeftRatio={0.55}
          minLeft={300}
          minRight={400}
          left={
            <div className="flex h-full flex-col overflow-y-auto">
              <div className="flex shrink-0 items-center justify-center p-4">
                <div
                  className="relative w-full overflow-hidden rounded-x"
                  style={{
                    maxWidth: 800,
                    boxShadow: "0 10px 30px -10px rgba(0,0,0,0.3)",
                  }}
                >
                  {renderVideoLoader()}

                  {!videoLoading && !videoError && videoSrc && (
                    <div
                      className="relative w-full"
                      style={{ aspectRatio: "16/9" }}
                    >
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
                    </div>
                  )}
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
            />
          }
        />
      </div>
    </div>
  );
};

export default VideoNoteView;
