import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  EditOutlined,
  MoreOutlined,
  DeleteOutlined,
  SoundOutlined,
  PlusOutlined,
  LoadingOutlined,
  CloseOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Pencil } from "lucide-react";
import { App, Tooltip, Dropdown, Spin, Empty } from "antd";
import type { MenuProps } from "antd";
import { useMemoizedFn, useThrottleFn } from "ahooks";
import { Descendant } from "slate";
import { Editor, EditorRef } from "@tau/editor/src";
import type { CustomEditor } from "@tau/editor/src";
import ResizablePanel from "@/components/ResizablePanel";
import EditTitleModal from "@/components/EditTitleModal";
import LocalVideo from "@/components/LocalVideo";
import BilibiliVideoLoader from "@/components/BilibiliVideoLoader";
import YoutubeVideoLoader from "@/components/YoutubeVideoLoader";
import NotionVideoLoader from "@/components/NotionVideoLoader";
import useUploadResource from "@/hooks/useUploadResource.ts";
import { useBilibiliVideo } from "@/hooks/useBilibiliVideo";
import { useYoutubeVideo } from "@/hooks/useYoutubeVideo";
import { useNotionVideo } from "@/hooks/useNotionVideo";
import useSettingStore from "@/stores/useSettingStore";
import { shouldUseLocalVideoCache } from "@/utils/video";
import {
  getVideoNoteById,
  deleteVideoNote,
  getVideoNoteItemByVideoNoteId,
  createVideoNoteItem,
  getContentById,
  createContent,
  updateContent,
  updateVideoNoteTranscript,
} from "@/commands";
import {
  transcribeAudio,
  onTranscriptionProgress,
  extractAudioFromVideo,
} from "@/commands/transcription";
import {
  checkTranscriptionLLMRequirement,
  openSettingsModal,
  prepareTranscriptionOptions,
} from "@/utils/transcription";
import { useLLMConfig } from "@/hooks/useLLMConfig";
import { useTranscriptionOptimization } from "@/hooks/useTranscriptionOptimization";
import { getBilibiliCacheStatus } from "@/commands/bilibili-cache";
import { getRemoteVideoCacheStatus } from "@/commands/remote-video-cache";
import { getYoutubeCacheStatus } from "@/commands/youtube-cache";
import { getNotionCacheStatus } from "@/commands/notion-cache";
import {
  type VideoNote as IVideoNote,
  type VideoNoteItem,
  type TranscriptSegment,
  BiliBiliVideoMetaInfo,
  YouTubeVideoMetaInfo,
  NotionVideoMetaInfo,
  LocalVideoMetaInfo,
  RemoteVideoMetaInfo,
} from "@/types";
import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
  chatReferenceExtension,
} from "@/editor-extensions";
import VideoTimestampExtension from "./extensions/VideoTimestamp";
import VideoScreenshotExtension from "./extensions/VideoScreenshot";
import { VideoController } from "./VideoController";

const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

const createEmptyEditorContent = (): Descendant[] =>
  JSON.parse(JSON.stringify(DEFAULT_CONTENT)) as Descendant[];

interface IVideoNoteViewProps {
  videoNoteId: number;
}

const VideoNoteView = ({ videoNoteId }: IVideoNoteViewProps) => {
  const { message, modal } = App.useApp();
  const uploadResource = useUploadResource();
  const autoCacheRemoteVideo = useSettingStore(
    (state) => state.setting.misc.video.autoCacheRemote,
  );

  // LLM optimization hook
  const { providerConfig, modelConfig } = useLLMConfig("transcriptionOptimization");
  const {
    isOptimizing,
    streamingSegments,
    finalSegments: optimizedFinalSegments,
    startOptimization,
    stopOptimization,
    error: optimizationError,
  } = useTranscriptionOptimization(providerConfig, modelConfig);

  // State
  const [videoNote, setVideoNote] = useState<IVideoNote | null>(null);
  const [noteItem, setNoteItem] = useState<VideoNoteItem | null>(null);
  const [noteContent, setNoteContent] = useState<Descendant[]>(
    createEmptyEditorContent(),
  );
  const [loading, setLoading] = useState(true);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionProgress, setTranscriptionProgress] = useState("");
  const [pendingWordSegments, setPendingWordSegments] = useState<TranscriptSegment[] | null>(null);
  const [editingSegmentIndex, setEditingSegmentIndex] = useState<number | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Refs
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const editorRef = useRef<EditorRef>(null);
  const slateEditorRef = useRef<CustomEditor | null>(null);

  // Callback ref to capture video element
  const setVideoRef = useCallback((element: HTMLVideoElement | null) => {
    videoElementRef.current = element;
  }, []);

  // Video hooks for different platforms
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

  // Video controller for timestamp functionality
  const videoController = useMemo(() => {
    return new VideoController(
      () => videoElementRef.current,
      async (file: File) => {
        const path = await uploadResource(file);
        return path || null;
      },
    );
  }, [uploadResource]);

  // Custom extensions for editor
  const customExtensions = useMemo(() => {
    return [
      contentLinkExtension,
      fileAttachmentExtension,
      questionCardExtension,
      chatReferenceExtension,
      new VideoTimestampExtension(videoController),
      new VideoScreenshotExtension(videoController),
    ];
  }, [videoController]);

  // Load video note data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const note = await getVideoNoteById(videoNoteId);
        if (!note) {
          message.error("视频笔记不存在");
          return;
        }
        setVideoNote(note);

        // Load note item
        let item = await getVideoNoteItemByVideoNoteId(videoNoteId);
        if (item) {
          setNoteItem(item);
          const content = await getContentById(item.contentId);
          if (content) {
            setNoteContent(content.content);
          }
        }
      } catch (error) {
        console.error("Failed to load video note:", error);
        message.error("加载失败");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [videoNoteId, message]);

  // Create note item if not exists
  const ensureNoteItem = useMemoizedFn(async () => {
    if (noteItem) return noteItem;

    try {
      const emptyContent = createEmptyEditorContent();
      const contentId = await createContent(emptyContent, 0);
      if (!contentId) {
        throw new Error("Failed to create content");
      }
      const item = await createVideoNoteItem({
        videoNoteId,
        contentId,
        title: "",
      });
      setNoteItem(item);
      setNoteContent(emptyContent);
      return item;
    } catch (error) {
      console.error("Failed to create note item:", error);
      message.error("创建笔记失败");
      return null;
    }
  });

  // Throttled content save
  const { run: throttleSaveContent } = useThrottleFn(
    async (contentId: number, content: Descendant[]) => {
      try {
        await updateContent(contentId, content);
      } catch (error) {
        console.error("Failed to save content:", error);
      }
    },
    { wait: 1000 },
  );

  // Handle editor content change
  const handleEditorChange = useMemoizedFn((content: Descendant[]) => {
    setNoteContent(content);
    if (noteItem) {
      throttleSaveContent(noteItem.contentId, content);
    }
  });

  // Handle editor init
  const handleEditorInit = useMemoizedFn((editor: CustomEditor) => {
    slateEditorRef.current = editor;
  });

  // Handle add note button click
  const handleAddNote = useMemoizedFn(async () => {
    const item = await ensureNoteItem();
    if (item && editorRef.current) {
      editorRef.current.focus();
    }
  });

  // Handle delete
  const handleDelete = useMemoizedFn(async () => {
    modal.confirm({
      title: "确认删除",
      content: "删除后无法恢复，是否确认删除此视频笔记？",
      okText: "删除",
      okType: "danger",
      cancelText: "取消",
      onOk: async () => {
        try {
          await deleteVideoNote(videoNoteId);
          message.success("删除成功");
          // TODO: Navigate back or close tab
        } catch (error) {
          console.error("Failed to delete:", error);
          message.error("删除失败");
        }
      },
    });
  });

  // Get local video path for transcription
  const getVideoLocalPath = useMemoizedFn(async (): Promise<string | null> => {
    if (!videoNote) return null;
    const { metaInfo } = videoNote;

    switch (metaInfo.type) {
      case "local":
        return (metaInfo as LocalVideoMetaInfo).filePath;
      case "remote": {
        const status = await getRemoteVideoCacheStatus(
          (metaInfo as RemoteVideoMetaInfo).url,
        );
        return status?.localPath || null;
      }
      case "bilibili": {
        const biliMeta = metaInfo as BiliBiliVideoMetaInfo;
        const status = await getBilibiliCacheStatus(
          biliMeta.bvid,
          biliMeta.cid,
          biliMeta.quality || 80,
        );
        return status?.localPath || null;
      }
      case "youtube": {
        const ytMeta = metaInfo as YouTubeVideoMetaInfo;
        const status = await getYoutubeCacheStatus(ytMeta.url);
        return status?.localPath || null;
      }
      case "notion": {
        const notionMeta = metaInfo as NotionVideoMetaInfo;
        const status = await getNotionCacheStatus(notionMeta.blockId);
        return status?.localPath || null;
      }
      default:
        return null;
    }
  });

  // Handle transcription
  const handleTranscribe = useMemoizedFn(async () => {
    const transcriptionSettings = useSettingStore.getState().setting.transcription;
    const currentModel = transcriptionSettings.currentModel;

    if (!currentModel) {
      message.warning("请先在设置中下载转录模型");
      return;
    }

    // 检查 LLM 优化配置
    const llmRequirement = checkTranscriptionLLMRequirement();
    if (llmRequirement.needsLLM && !llmRequirement.isConfigured) {
      modal.confirm({
        title: "LLM 优化配置不完整",
        content: `${llmRequirement.errorMessage}。是否打开设置页面进行配置？`,
        okText: "打开设置",
        cancelText: "取消转录",
        onOk: () => {
          openSettingsModal("llm");
        },
      });
      return;
    }

    const videoPath = await getVideoLocalPath();
    if (!videoPath) {
      message.warning("视频尚未缓存，请等待视频加载完成后再试");
      return;
    }

    setIsTranscribing(true);
    setTranscriptionProgress("正在提取音频...");

    try {
      const extractResult = await extractAudioFromVideo(videoPath);
      if (!extractResult.success || !extractResult.audioPath) {
        throw new Error(extractResult.error || "提取音频失败");
      }

      setTranscriptionProgress(`正在转录 ...`);
      const unsubscribe = onTranscriptionProgress((data) => {
        setTranscriptionProgress(data.message);
      });

      // 使用 prepareTranscriptionOptions 准备完整的转录选项
      const options = prepareTranscriptionOptions({
        language: "zh", // 可以根据需要动态设置
      });

      const result = await transcribeAudio(extractResult.audioPath, options);

      unsubscribe();

      if (result.success && result.data) {
        // 如果需要 LLM 优化且有词级时间戳，启动流式优化
        if (llmRequirement.needsLLM && result.data.wordSegments && result.data.wordSegments.length > 0) {
          setTranscriptionProgress("正在使用 AI 优化断句...");
          // 保存原始数据，等流式优化完成后使用
          setPendingWordSegments(result.data.wordSegments);
          // 启动流式优化
          startOptimization(
            result.data.wordSegments,
            result.data.language || "zh",
          );
          // 不在这里结束 isTranscribing，等待 useEffect 处理完成
        } else {
          // 无需 LLM 优化，直接保存
          const finalSegments = result.data.segments;
          const finalText = result.data.text;
          const wordSegments = result.data.wordSegments;

          setTranscriptionProgress("正在保存...");
          await updateVideoNoteTranscript(
            videoNoteId,
            finalText,
            finalSegments,
            wordSegments, // 同时保存词级时间戳，以便后续重新 AI 优化
          );
          setVideoNote((prev) =>
            prev
              ? {
                  ...prev,
                  transcript: finalText,
                  transcriptSegments: finalSegments,
                  transcriptWordSegments: wordSegments,
                }
              : null,
          );
          setIsTranscribing(false);
          setTranscriptionProgress("");
          message.success("转录完成");
        }
      } else {
        throw new Error(result.error || "转录失败");
      }
    } catch (error) {
      console.error("Transcription error:", error);
      message.error(`转录失败: ${error}`);
      setIsTranscribing(false);
      setTranscriptionProgress("");
    }
  });

  // 处理流式优化完成后的保存
  useEffect(() => {
    const saveOptimizedResult = async () => {
      if (optimizedFinalSegments && !isOptimizing && pendingWordSegments) {
        try {
          const finalText = optimizedFinalSegments.map((s) => s.text).join(" ");

          setTranscriptionProgress("正在保存...");
          await updateVideoNoteTranscript(
            videoNoteId,
            finalText,
            optimizedFinalSegments,
            pendingWordSegments, // 保存原始词级时间戳，以便后续重新 AI 优化
          );
          setVideoNote((prev) =>
            prev
              ? {
                  ...prev,
                  transcript: finalText,
                  transcriptSegments: optimizedFinalSegments,
                  transcriptWordSegments: pendingWordSegments,
                }
              : null,
          );

          if (optimizationError) {
            message.warning("AI 优化出现错误，使用部分结果");
          } else {
            message.success("转录完成（已使用 AI 优化断句）");
          }
        } catch (error) {
          console.error("Failed to save optimized transcript:", error);
          message.error("保存失败");
        } finally {
          setIsTranscribing(false);
          setTranscriptionProgress("");
          setPendingWordSegments(null);
        }
      }
    };

    saveOptimizedResult();
  }, [optimizedFinalSegments, isOptimizing, pendingWordSegments, videoNoteId, optimizationError, message]);

  // 取消优化
  const handleCancelOptimization = useMemoizedFn(() => {
    stopOptimization();
    setIsTranscribing(false);
    setTranscriptionProgress("");
    setPendingWordSegments(null);
    message.info("优化已取消");
  });

  // 单独使用 AI 优化（针对已有转录）
  const handleAIOptimize = useMemoizedFn(async () => {
    if (!videoNote?.transcriptWordSegments || videoNote.transcriptWordSegments.length === 0) {
      message.warning("没有可用于优化的词级时间戳数据");
      return;
    }

    // 检查 LLM 配置
    const llmRequirement = checkTranscriptionLLMRequirement();
    if (!llmRequirement.isConfigured) {
      modal.confirm({
        title: "LLM 优化配置不完整",
        content: `${llmRequirement.errorMessage}。是否打开设置页面进行配置？`,
        okText: "打开设置",
        cancelText: "取消",
        onOk: () => {
          openSettingsModal("llm");
        },
      });
      return;
    }

    setIsTranscribing(true);
    setTranscriptionProgress("正在使用 AI 优化断句...");
    setPendingWordSegments(videoNote.transcriptWordSegments);

    // 启动流式优化
    startOptimization(
      videoNote.transcriptWordSegments,
      "zh", // 默认使用中文
    );
  });

  // 开始编辑转录片段（打开弹窗）
  const handleStartEditSegment = useMemoizedFn((index: number) => {
    setEditingSegmentIndex(index);
    setEditModalOpen(true);
  });

  // 取消编辑（关闭弹窗）
  const handleCancelEditSegment = useMemoizedFn(() => {
    setEditModalOpen(false);
    setEditingSegmentIndex(null);
  });

  // 保存编辑
  const handleSaveEditSegment = useMemoizedFn(async (result: { title: string }) => {
    if (editingSegmentIndex === null || !videoNote?.transcriptSegments) return;

    const newSegments = [...videoNote.transcriptSegments];
    newSegments[editingSegmentIndex] = {
      ...newSegments[editingSegmentIndex],
      text: result.title.trim(),
    };

    // 更新本地状态
    setVideoNote((prev) =>
      prev
        ? {
            ...prev,
            transcriptSegments: newSegments,
            transcript: newSegments.map((s) => s.text).join(" "),
          }
        : null,
    );

    // 保存到数据库
    try {
      await updateVideoNoteTranscript(
        videoNoteId,
        newSegments.map((s) => s.text).join(" "),
        newSegments,
        videoNote.transcriptWordSegments,
      );
    } catch (error) {
      console.error("Failed to save edited segment:", error);
      message.error("保存失败");
    }

    // 清除编辑状态
    setEditModalOpen(false);
    setEditingSegmentIndex(null);
  });

  // More menu items
  const moreMenuItems: MenuProps["items"] = [
    {
      key: "delete",
      icon: <DeleteOutlined />,
      label: "删除",
      danger: true,
      onClick: handleDelete,
    },
  ];

  // Format time in mm:ss format
  const formatTime = useCallback((ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }, []);

  // Handle segment click - seek to time
  const handleSegmentClick = useCallback(
    (segment: TranscriptSegment) => {
      if (videoElementRef.current) {
        videoElementRef.current.currentTime = segment.start / 1000;
        videoElementRef.current.play().catch(() => {});
      }
    },
    [],
  );

  // Get video source based on type
  const getVideoSrc = () => {
    if (!videoNote) return null;
    const { metaInfo } = videoNote;

    switch (metaInfo.type) {
      case "local":
        return metaInfo.filePath;
      case "remote":
        return metaInfo.url;
      case "bilibili":
        return bilibiliVideoUrl;
      case "youtube":
        return youtubeVideoUrl;
      case "notion":
        return notionVideoUrl;
      default:
        return null;
    }
  };

  // Check if video is loading
  const isVideoLoading = () => {
    if (!videoNote) return true;
    const { metaInfo } = videoNote;

    switch (metaInfo.type) {
      case "bilibili":
        return bilibiliLoading;
      case "youtube":
        return youtubeLoading;
      case "notion":
        return notionLoading;
      default:
        return false;
    }
  };

  // Get video error
  const getVideoError = () => {
    if (!videoNote) return null;
    const { metaInfo } = videoNote;

    switch (metaInfo.type) {
      case "bilibili":
        return bilibiliError;
      case "youtube":
        return youtubeError;
      case "notion":
        return notionError;
      default:
        return null;
    }
  };

  // Check if should use local video
  const shouldUseLocalVideo = () => {
    if (!videoNote) return false;
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
  };

  // Render video loader for special platforms
  const renderVideoLoader = () => {
    if (!videoNote) return null;
    const { metaInfo } = videoNote;

    switch (metaInfo.type) {
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

  const videoSrc = getVideoSrc();
  const videoLoading = isVideoLoading();
  const videoError = getVideoError();
  const useLocalVideo = shouldUseLocalVideo();

  return (
    <div className="flex h-full w-full flex-col">
      {/* Toolbar */}
      <div className="flex h-12 shrink-0 items-center justify-end border-b border-gray-200 px-4 dark:border-gray-700">
        <div className="flex items-center gap-2">
          {/* 转录按钮 */}
          <Tooltip title={isTranscribing ? transcriptionProgress : "转录视频"}>
            <button
              className="flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isTranscribing || !videoNote}
              onClick={handleTranscribe}
            >
              {isTranscribing ? (
                <LoadingOutlined className="animate-spin" />
              ) : (
                <SoundOutlined />
              )}
              <span>{isTranscribing ? "转录中..." : "转录"}</span>
            </button>
          </Tooltip>

          {/* AI 优化按钮 - 仅在存在词级时间戳时显示 */}
          {videoNote?.transcriptWordSegments && videoNote.transcriptWordSegments.length > 0 && (
            <Tooltip title="使用 AI 重新优化断句">
              <button
                className="flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isTranscribing}
                onClick={handleAIOptimize}
              >
                <ThunderboltOutlined />
                <span>AI 优化</span>
              </button>
            </Tooltip>
          )}

          {/* 添加笔记按钮 */}
          {!noteItem && (
            <Tooltip title="添加笔记">
              <button
                className="flex h-8 items-center gap-1.5 rounded-md bg-blue-500 px-3 text-sm text-white hover:bg-blue-600"
                onClick={handleAddNote}
              >
                <PlusOutlined />
                <span>添加笔记</span>
              </button>
            </Tooltip>
          )}

          {/* 更多菜单 */}
          <Dropdown menu={{ items: moreMenuItems }} trigger={["click"]}>
            <button className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800">
              <MoreOutlined />
            </button>
          </Dropdown>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanel
          id="video-note-view"
          initialLeftRatio={0.5}
          minLeft={300}
          minRight={400}
          left={
            <div className="flex h-full flex-col overflow-hidden">
              {/* Video section */}
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
                    <div className="relative w-full" style={{ aspectRatio: "16/9" }}>
                      {useLocalVideo ? (
                        <LocalVideo
                          ref={setVideoRef}
                          src={videoSrc}
                          controls
                          crossOrigin="anonymous"
                          className="absolute inset-0 h-full w-full object-contain"
                        />
                      ) : (
                        <video
                          ref={setVideoRef}
                          src={videoSrc}
                          controls
                          crossOrigin="anonymous"
                          className="absolute inset-0 h-full w-full object-contain"
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Description / Transcript section */}
              <div className="flex-1 overflow-auto border-t border-gray-200 p-4 dark:border-gray-700">
                {isTranscribing ? (
                  <div className="flex h-full flex-col">
                    {/* 流式优化时显示实时 segments */}
                    {isOptimizing && streamingSegments.length > 0 ? (
                      <div className="flex-1 space-y-1 overflow-auto">
                        {streamingSegments.map((segment, index) => (
                          <div
                            key={`${segment.start}-${index}`}
                            className={`flex cursor-pointer gap-3 rounded-md p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 ${
                              segment.status === "pending" ? "opacity-70" : ""
                            }`}
                            onClick={() =>
                              handleSegmentClick({
                                text: segment.text,
                                start: segment.start,
                                end: segment.end ?? segment.start + 5000,
                              })
                            }
                          >
                            <span className="shrink-0 font-mono text-xs text-blue-500 dark:text-blue-400">
                              {formatTime(segment.start)}
                            </span>
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              {segment.text}
                            </span>
                            {segment.status === "pending" && (
                              <LoadingOutlined className="ml-auto animate-spin text-xs text-gray-400" />
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-500">
                        <LoadingOutlined className="text-2xl animate-spin" />
                        <span className="text-sm">{transcriptionProgress}</span>
                      </div>
                    )}
                    {/* 取消按钮 */}
                    {isOptimizing && (
                      <div className="mt-4 flex justify-center border-t border-gray-200 pt-4 dark:border-gray-700">
                        <button
                          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={handleCancelOptimization}
                        >
                          <CloseOutlined />
                          <span>取消优化</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : videoNote.transcriptSegments &&
                  videoNote.transcriptSegments.length > 0 ? (
                  <div className="space-y-1">
                    {videoNote.transcriptSegments.map((segment, index) => (
                      <div
                        key={index}
                        className="group flex items-start gap-3 rounded-md p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        <span
                          className="shrink-0 cursor-pointer font-mono text-xs text-blue-500 dark:text-blue-400"
                          onClick={() => handleSegmentClick(segment)}
                        >
                          {formatTime(segment.start)}
                        </span>
                        <span
                          className="flex-1 cursor-pointer text-sm text-gray-700 dark:text-gray-300"
                          onClick={() => handleSegmentClick(segment)}
                        >
                          {segment.text}
                        </span>
                        <button
                          className="invisible flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-600 group-hover:visible dark:hover:bg-gray-700 dark:hover:text-gray-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartEditSegment(index);
                          }}
                          title="编辑"
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : videoNote.transcript ? (
                  <div className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                    {videoNote.transcript}
                  </div>
                ) : videoNote.description ? (
                  <div className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                    {videoNote.description}
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400">
                    <SoundOutlined className="text-2xl" />
                    <span className="text-sm">点击"转录"按钮生成视频字幕</span>
                  </div>
                )}
              </div>
            </div>
          }
          right={
            <div className="h-full overflow-auto p-4">
              {noteItem ? (
                <Editor
                  ref={editorRef}
                  initValue={noteContent}
                  onChange={handleEditorChange}
                  extensions={customExtensions}
                  readonly={false}
                  onInit={handleEditorInit}
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <button
                    className="flex items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-6 py-4 text-gray-500 transition-colors hover:border-blue-400 hover:text-blue-500 dark:border-gray-600 dark:text-gray-400 dark:hover:border-blue-500 dark:hover:text-blue-400"
                    onClick={handleAddNote}
                  >
                    <EditOutlined className="text-lg" />
                    <span>点击开始记笔记</span>
                  </button>
                </div>
              )}
            </div>
          }
        />
      </div>

      {/* 编辑转录文案弹窗 */}
      <EditTitleModal
        open={editModalOpen}
        onCancel={handleCancelEditSegment}
        onConfirm={handleSaveEditSegment}
        initialTitle={
          editingSegmentIndex !== null && videoNote?.transcriptSegments
            ? videoNote.transcriptSegments[editingSegmentIndex]?.text || ""
            : ""
        }
        modalTitle="编辑转录文案"
        modalDescription="修改转录内容"
        placeholder="请输入转录文案"
      />
    </div>
  );
};

export default VideoNoteView;
