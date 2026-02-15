import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  EditOutlined,
  SoundOutlined,
  LoadingOutlined,
  CloseOutlined,
  ThunderboltOutlined,
  GlobalOutlined,
} from "@ant-design/icons";
import { Pencil, FileText, Expand } from "lucide-react";
import { App, Tooltip, Spin, Empty, Select } from "antd";
import { useMemoizedFn, useThrottleFn } from "ahooks";
import classNames from "classnames";
import { Descendant } from "slate";
import { Editor, EditorRef } from "@tau/editor/src";
import { importFromMarkdown, getMarkdown } from "@/utils/markdown";
import type { CustomEditor } from "@tau/editor/src";
import ResizablePanel from "@/components/ResizablePanel";
import EditTitleModal from "@/components/EditTitleModal";
import CustomModal from "@/components/CustomModal";
import LocalVideo from "@/components/LocalVideo";
import BilibiliVideoLoader from "@/components/BilibiliVideoLoader";
import YoutubeVideoLoader from "@/components/YoutubeVideoLoader";
import NotionVideoLoader from "@/components/NotionVideoLoader";
import RemoteVideoLoader from "@/components/RemoteVideoLoader";
import useUploadResource from "@/hooks/useUploadResource.ts";
import useThemeColors from "@/hooks/useThemeColors";
import { useBilibiliVideo } from "@/hooks/useBilibiliVideo";
import { useYoutubeVideo } from "@/hooks/useYoutubeVideo";
import { useNotionVideo } from "@/hooks/useNotionVideo";
import { useRemoteVideo } from "@/hooks/useRemoteVideo";
import useSettingStore from "@/stores/useSettingStore";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import { shouldUseLocalVideoCache } from "@/utils/video";
import {
  getVideoNoteById,
  getVideoNoteItemByVideoNoteId,
  createVideoNoteItem,
  getContentById,
  createContent,
  updateContent,
  updateVideoNoteTranscript,
  updateVideoNoteSummary,
} from "@/commands";
import {
  transcribeAudio,
  onTranscriptionProgress,
  extractAudioFromVideo,
  shouldSegmentAudio,
  transcribeAudioSegmented,
} from "@/commands/transcription";
import {
  checkTranscriptionLLMRequirement,
  openSettingsModal,
  prepareTranscriptionOptions,
} from "@/utils/transcription";
import { useLLMConfig } from "@/hooks/useLLMConfig";
import { useTranscriptionOptimization } from "@/hooks/useTranscriptionOptimization";
import { useVideoSummary } from "@/hooks/useVideoSummary";
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
import {} from "@/editor-extensions";
import VideoTimestampExtension from "./extensions/VideoTimestamp";
import VideoScreenshotExtension from "./extensions/VideoScreenshot";
import SummaryTimestampExtension from "./extensions/SummaryTimestamp";
import { VideoController } from "./VideoController";
import { buildWebVtt } from "./subtitle";

const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

const createEmptyEditorContent = (): Descendant[] =>
  JSON.parse(JSON.stringify(DEFAULT_CONTENT)) as Descendant[];

// 支持的转录语言列表
const TRANSCRIPTION_LANGUAGES = [
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
  const { message, modal } = App.useApp();
  const dynamicExtensions = useDynamicExtensionsStore(
    (state) => state.extensions,
  );
  const uploadResource = useUploadResource();
  const themeColors = useThemeColors();
  const autoCacheRemoteVideo = useSettingStore(
    (state) => state.setting.misc.video.autoCacheRemote,
  );

  // LLM optimization hook
  const { providerConfig, modelConfig } = useLLMConfig(
    "transcriptionOptimization",
  );
  const {
    isOptimizing,
    streamingSegments,
    finalSegments: optimizedFinalSegments,
    startOptimization,
    stopOptimization,
    error: optimizationError,
  } = useTranscriptionOptimization(providerConfig, modelConfig);

  // Video summary LLM hook
  const {
    providerConfig: summaryProviderConfig,
    modelConfig: summaryModelConfig,
  } = useLLMConfig("videoSummary");
  const {
    isSummarizing,
    summaryContent,
    finalSummary,
    startSummary,
    stopSummary,
    error: summaryError,
  } = useVideoSummary(summaryProviderConfig, summaryModelConfig);

  // State
  const [videoNote, setVideoNote] = useState<IVideoNote | null>(null);
  const [noteItem, setNoteItem] = useState<VideoNoteItem | null>(null);
  const [noteContent, setNoteContent] = useState<Descendant[]>(
    createEmptyEditorContent(),
  );
  const [loading, setLoading] = useState(true);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionProgress, setTranscriptionProgress] = useState("");
  const [pendingWordSegments, setPendingWordSegments] = useState<
    TranscriptSegment[] | null
  >(null);
  const [editingSegmentIndex, setEditingSegmentIndex] = useState<number | null>(
    null,
  );
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"transcript" | "summary">(
    "transcript",
  );
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [transcriptionLanguage, setTranscriptionLanguage] =
    useState<string>("zh"); // 默认中文
  const [subtitleMounted, setSubtitleMounted] = useState(false);
  const [subtitleTrackUrl, setSubtitleTrackUrl] = useState("");

  // 当前高亮的转录片段索引（用于视频播放时的同步高亮）
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState<number | null>(
    null,
  );

  // Refs
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  // 转录列表容器的 ref，用于判断视口
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  // 存储每个 segment DOM 元素的 ref
  const segmentRefsMap = useRef<Map<number, HTMLDivElement>>(new Map());
  const editorRef = useRef<EditorRef>(null);
  const summaryEditorRef = useRef<EditorRef>(null);
  const slateEditorRef = useRef<CustomEditor | null>(null);
  const modalSummaryEditorRef = useRef<EditorRef>(null);

  // Summary session ID to force re-render when starting new summary
  const [summarySessionId, setSummarySessionId] = useState(0);

  // 用于存储 timeupdate 事件处理函数的 ref（避免 callback ref 的依赖问题）
  const timeUpdateHandlerRef = useRef<(() => void) | null>(null);
  const subtitleStorageKey = useMemo(
    () => `${SUBTITLE_MOUNTED_STORAGE_PREFIX}${videoNoteId}`,
    [videoNoteId],
  );

  // Callback ref to capture video element and add timeupdate listener
  const setVideoRef = useCallback((element: HTMLVideoElement | null) => {
    // 移除旧元素的事件监听器
    if (videoElementRef.current && timeUpdateHandlerRef.current) {
      videoElementRef.current.removeEventListener(
        "timeupdate",
        timeUpdateHandlerRef.current,
      );
    }

    videoElementRef.current = element;

    // 为新元素添加事件监听器
    if (element && timeUpdateHandlerRef.current) {
      element.addEventListener("timeupdate", timeUpdateHandlerRef.current);
    }
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
      ...dynamicExtensions,
      new VideoTimestampExtension(videoController),
      new VideoScreenshotExtension(videoController),
    ];
  }, [videoController, dynamicExtensions]);

  // Extensions for summary editor (only timestamp)
  const summaryExtensions = useMemo(() => {
    return [new SummaryTimestampExtension(videoController)];
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
        const item = await getVideoNoteItemByVideoNoteId(videoNoteId);
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

  // 读取字幕挂载偏好（按视频笔记记住）
  useEffect(() => {
    try {
      const savedValue = localStorage.getItem(subtitleStorageKey);
      setSubtitleMounted(savedValue === "true");
    } catch (error) {
      console.warn("读取字幕挂载状态失败:", error);
      setSubtitleMounted(false);
    }
  }, [subtitleStorageKey]);

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

  // Throttled summary save
  const { run: throttleSaveSummary } = useThrottleFn(
    async (summary: string) => {
      try {
        await updateVideoNoteSummary(videoNoteId, summary);
        setVideoNote((prev) =>
          prev
            ? {
                ...prev,
                summary: summary,
              }
            : null,
        );

        // 更新主视图的总结编辑器（Editor 是非受控组件，需要手动更新）
        if (summaryEditorRef.current && summary) {
          const content = importFromMarkdown(summary);
          summaryEditorRef.current.setEditorValue(content);
        }
      } catch (error) {
        console.error("Failed to save summary:", error);
        message.error("保存总结失败");
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

  // Handle summary content change
  const handleSummaryChange = useMemoizedFn((content: Descendant[]) => {
    const markdown = getMarkdown(content);
    throttleSaveSummary(markdown);
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
    const transcriptionSettings =
      useSettingStore.getState().setting.transcription;
    const currentModel = transcriptionSettings.currentModel;

    if (!currentModel) {
      message.warning("请先在设置中下载转录模型");
      return;
    }

    // 检查 LLM 优化配置
    const llmRequirement = checkTranscriptionLLMRequirement();
    console.log(
      `[VideoNoteView] LLM requirement check - needsLLM: ${llmRequirement.needsLLM}, isConfigured: ${llmRequirement.isConfigured}`,
    );
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

      // 使用 prepareTranscriptionOptions 准备完整的转录选项
      const options = prepareTranscriptionOptions({
        language: transcriptionLanguage, // 使用用户选择的语言
      });
      console.log(
        `[VideoNoteView] Transcription options - sentenceLevel: ${options.sentenceLevel}, useLLMOptimization: ${options.useLLMOptimization}`,
      );

      // 检查是否需要分段转录（长视频处理）
      const miscSettings = useSettingStore.getState().setting.misc;
      const enableLongVideoSegmentation =
        miscSettings?.transcription?.enableLongVideoSegmentation ?? true;

      let result;
      if (enableLongVideoSegmentation) {
        setTranscriptionProgress("正在检查视频时长...");
        const segmentCheck = await shouldSegmentAudio(extractResult.audioPath);

        if (segmentCheck.success && segmentCheck.shouldSegment) {
          // 使用分段转录
          const durationMinutes = Math.round((segmentCheck.duration || 0) / 60);
          setTranscriptionProgress(
            `长视频检测到 (${durationMinutes} 分钟)，准备分段转录...`,
          );
          console.log(
            `[VideoNoteView] Long video detected (${durationMinutes} min), using segmented transcription`,
          );

          const unsubscribe = onTranscriptionProgress((data) => {
            setTranscriptionProgress(data.message);
          });

          result = await transcribeAudioSegmented(
            extractResult.audioPath,
            options,
          );

          unsubscribe();
        } else {
          // 常规转录
          setTranscriptionProgress(`正在转录 ...`);
          const unsubscribe = onTranscriptionProgress((data) => {
            setTranscriptionProgress(data.message);
          });

          result = await transcribeAudio(extractResult.audioPath, options);

          unsubscribe();
        }
      } else {
        // 未启用分段转录，使用常规转录
        setTranscriptionProgress(`正在转录 ...`);
        const unsubscribe = onTranscriptionProgress((data) => {
          setTranscriptionProgress(data.message);
        });

        result = await transcribeAudio(extractResult.audioPath, options);

        unsubscribe();
      }

      if (result.success && result.data) {
        // 如果需要 LLM 优化且有词级时间戳，启动流式优化
        if (
          llmRequirement.needsLLM &&
          result.data.wordSegments &&
          result.data.wordSegments.length > 0
        ) {
          console.log(
            `[VideoNoteView] Starting LLM optimization with ${result.data.wordSegments.length} word segments`,
          );
          setTranscriptionProgress("正在使用 AI 优化断句...");
          // 保存原始数据，等流式优化完成后使用
          setPendingWordSegments(result.data.wordSegments);
          // 启动流式优化,使用用户选择的语言
          startOptimization(result.data.wordSegments, transcriptionLanguage);
          // 不在这里结束 isTranscribing，等待 useEffect 处理完成
        } else {
          // 无需 LLM 优化，直接保存
          console.log(
            `[VideoNoteView] Skipping LLM optimization (needsLLM: ${llmRequirement.needsLLM}, wordSegments: ${result.data.wordSegments?.length || 0})`,
          );
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
  }, [
    optimizedFinalSegments,
    isOptimizing,
    pendingWordSegments,
    videoNoteId,
    optimizationError,
    message,
  ]);

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
    if (
      !videoNote?.transcriptWordSegments ||
      videoNote.transcriptWordSegments.length === 0
    ) {
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

    // 启动流式优化,使用用户选择的语言
    startOptimization(videoNote.transcriptWordSegments, transcriptionLanguage);
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
  const handleSaveEditSegment = useMemoizedFn(
    async (result: { title: string }) => {
      if (editingSegmentIndex === null || !videoNote?.transcriptSegments)
        return;

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
    },
  );

  // 处理总结完成后的保存
  useEffect(() => {
    const saveSummaryResult = async () => {
      if (finalSummary && !isSummarizing) {
        // 如果模态框打开，不自动保存（让用户编辑）
        if (summaryModalOpen) {
          return;
        }

        try {
          await updateVideoNoteSummary(videoNoteId, finalSummary);
          setVideoNote((prev) =>
            prev
              ? {
                  ...prev,
                  summary: finalSummary,
                }
              : null,
          );
          if (summaryError) {
            message.warning("总结生成出现错误");
          } else {
            message.success("视频总结完成");
          }
        } catch (error) {
          console.error("Failed to save summary:", error);
          message.error("保存总结失败");
        }
      }
    };

    saveSummaryResult();
  }, [
    finalSummary,
    isSummarizing,
    videoNoteId,
    summaryError,
    summaryModalOpen,
    message,
  ]);

  // Update summary editor content when summaryContent changes (streaming)
  useEffect(() => {
    if (summaryContent && summaryEditorRef.current) {
      summaryEditorRef.current.setEditorValue(summaryContent);
    }
  }, [summaryContent]);

  // Update modal summary editor content when summaryContent changes (streaming)
  useEffect(() => {
    if (
      isSummarizing &&
      summaryContent &&
      modalSummaryEditorRef.current &&
      summaryModalOpen
    ) {
      modalSummaryEditorRef.current.setEditorValue(summaryContent);
    }
  }, [summaryContent, isSummarizing, summaryModalOpen]);

  // 处理视频总结
  const handleSummarize = useMemoizedFn(async () => {
    // 检查是否有转录
    if (
      !videoNote?.transcriptSegments ||
      videoNote.transcriptSegments.length === 0
    ) {
      modal.confirm({
        title: "需要先转录",
        content: "视频尚未转录，是否先进行转录？",
        okText: "开始转录",
        cancelText: "取消",
        onOk: () => {
          handleTranscribe();
        },
      });
      return;
    }

    // 检查 LLM 配置
    if (!summaryProviderConfig || !summaryModelConfig) {
      modal.confirm({
        title: "未配置总结模型",
        content: "请先在设置中配置视频总结的 LLM 模型。",
        okText: "打开设置",
        cancelText: "取消",
        onOk: () => {
          openSettingsModal("llm");
        },
      });
      return;
    }

    // 切换到总结 Tab 并开始总结
    setActiveTab("summary");
    setSummarySessionId((prev) => prev + 1); // Force re-render editor
    startSummary(videoNote.transcriptSegments);
  });

  // 取消总结
  const handleCancelSummary = useMemoizedFn(() => {
    stopSummary();
    message.info("总结已取消");
  });

  // 手动切换字幕挂载
  const handleToggleSubtitle = useMemoizedFn(() => {
    if (!videoNote?.transcriptSegments?.length) {
      message.warning("请先转录后再挂载字幕");
      return;
    }

    setSubtitleMounted((previous) => {
      const next = !previous;
      try {
        localStorage.setItem(subtitleStorageKey, String(next));
      } catch (error) {
        console.warn("保存字幕挂载状态失败:", error);
      }
      return next;
    });
  });

  // Format time in mm:ss format
  const formatTime = useCallback((ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }, []);

  // 根据当前时间（毫秒）查找对应的 segment 索引
  // 如果当前时间在 segment 的时间范围内，返回该 segment 的索引
  // 如果当前时间在两个 segment 之间的间隙中，返回前一个 segment 的索引
  const findCurrentSegmentIndex = useCallback(
    (currentTimeMs: number, segments: TranscriptSegment[]): number | null => {
      if (segments.length === 0) return null;

      // 如果当前时间小于第一个 segment 的开始时间，返回 null
      if (currentTimeMs < segments[0].start) return null;

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const nextSegment = segments[i + 1];

        // 当前时间在这个 segment 的范围内
        if (currentTimeMs >= segment.start && currentTimeMs < segment.end) {
          return i;
        }

        // 当前时间在这个 segment 结束后、下一个 segment 开始前（间隙中）
        // 保持高亮当前 segment
        if (
          nextSegment &&
          currentTimeMs >= segment.end &&
          currentTimeMs < nextSegment.start
        ) {
          return i;
        }
      }

      // 如果超过最后一个 segment 的结束时间，返回最后一个 segment 的索引
      const lastSegment = segments[segments.length - 1];
      if (currentTimeMs >= lastSegment.end) {
        return segments.length - 1;
      }

      return null;
    },
    [],
  );

  // 检查是否需要自动滚动（仅当前一个高亮句子在视口中时才滚动）
  const checkShouldAutoScroll = useCallback(
    (prevIndex: number | null): boolean => {
      // 如果没有前一个高亮句子，不滚动
      if (prevIndex === null) return false;

      const container = transcriptContainerRef.current;
      const prevElement = segmentRefsMap.current.get(prevIndex);

      if (!container || !prevElement) return false;

      // 检查前一个元素是否在容器的可视区域内
      const containerRect = container.getBoundingClientRect();
      const elementRect = prevElement.getBoundingClientRect();

      return (
        elementRect.top >= containerRect.top &&
        elementRect.bottom <= containerRect.bottom
      );
    },
    [],
  );

  // 滚动到指定的 segment
  const scrollToSegment = useCallback((index: number) => {
    const element = segmentRefsMap.current.get(index);
    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, []);

  // 视频 timeupdate 事件处理（使用节流优化性能）
  const { run: handleVideoTimeUpdate } = useThrottleFn(
    () => {
      const video = videoElementRef.current;
      const segments = videoNote?.transcriptSegments;

      // 只有在 transcript tab 激活且视频正在播放时才处理
      if (
        !video ||
        !segments?.length ||
        video.paused ||
        activeTab !== "transcript"
      ) {
        return;
      }

      const currentTimeMs = video.currentTime * 1000;
      const newIndex = findCurrentSegmentIndex(currentTimeMs, segments);

      if (newIndex !== null && newIndex !== currentSegmentIndex) {
        // 检查前一个 segment 是否在视口中，决定是否自动滚动
        const shouldScroll = checkShouldAutoScroll(currentSegmentIndex);
        setCurrentSegmentIndex(newIndex);

        if (shouldScroll) {
          scrollToSegment(newIndex);
        }
      }
    },
    { wait: 100 },
  );

  const subtitleVttContent = useMemo(() => {
    const segments = videoNote?.transcriptSegments;
    if (!segments || segments.length === 0) {
      return "";
    }
    return buildWebVtt(segments, { minDurationMs: 500 });
  }, [videoNote?.transcriptSegments]);

  // 管理字幕轨 URL 生命周期
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

  // 当 handleVideoTimeUpdate 变化时，更新 ref 并重新绑定事件监听器
  useEffect(() => {
    const video = videoElementRef.current;

    // 移除旧的监听器
    if (video && timeUpdateHandlerRef.current) {
      video.removeEventListener("timeupdate", timeUpdateHandlerRef.current);
    }

    // 更新 ref
    timeUpdateHandlerRef.current = handleVideoTimeUpdate;

    // 添加新的监听器
    if (video) {
      video.addEventListener("timeupdate", handleVideoTimeUpdate);
    }

    return () => {
      if (video && timeUpdateHandlerRef.current) {
        video.removeEventListener("timeupdate", timeUpdateHandlerRef.current);
      }
    };
  }, [handleVideoTimeUpdate]);

  const handleSegmentClick = useCallback((segment: TranscriptSegment) => {
    if (videoElementRef.current) {
      videoElementRef.current.currentTime = segment.start / 1000;
      videoElementRef.current.play().catch(() => {});
    }
  }, []);

  // Get video source based on type
  const getVideoSrc = () => {
    if (!videoNote) return null;
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
      case "remote":
        return remoteLoading;
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
      case "remote":
        return remoteError;
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

  const videoSrc = getVideoSrc();
  const videoLoading = isVideoLoading();
  const videoError = getVideoError();
  const useLocalVideo = shouldUseLocalVideo();
  const hasTranscriptSegments = !!videoNote?.transcriptSegments?.length;
  const subtitleTooltipTitle = !hasTranscriptSegments
    ? "请先转录后再挂载字幕"
    : subtitleMounted
      ? "已挂载字幕（可关闭）"
      : "挂载字幕";
  const subtitleTrackElement =
    subtitleMounted && subtitleTrackUrl ? (
      <track
        key={subtitleTrackUrl}
        kind="subtitles"
        src={subtitleTrackUrl}
        srcLang={transcriptionLanguage}
        label="转录字幕"
        default
      />
    ) : null;

  // 计算模态框编辑器是否可编辑
  const isModalEditable =
    !isSummarizing && (finalSummary || videoNote?.summary);

  return (
    <div className="flex h-full w-full flex-col">
      {/* Toolbar */}
      <div className="flex h-12 shrink-0 items-center justify-end border-b border-gray-200 px-4 dark:border-gray-700">
        <div className="flex items-center gap-3">
          {/* 语言选择器 */}
          <div className="flex items-center gap-2">
            <GlobalOutlined className="text-base text-gray-600 dark:text-gray-300" />
            <Select
              value={transcriptionLanguage}
              onChange={setTranscriptionLanguage}
              options={TRANSCRIPTION_LANGUAGES}
              className="w-52"
              disabled={isTranscribing}
              popupMatchSelectWidth={false}
              placeholder="选择转录语言"
            />
          </div>

          {/* 转录按钮 */}
          <Tooltip title={isTranscribing ? transcriptionProgress : "转录视频"}>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isTranscribing || !videoNote}
              onClick={handleTranscribe}
            >
              {isTranscribing ? (
                <LoadingOutlined className="animate-spin" />
              ) : (
                <SoundOutlined />
              )}
            </button>
          </Tooltip>

          {/* AI 优化按钮 - 仅在存在词级时间戳时显示 */}
          {videoNote?.transcriptWordSegments &&
            videoNote.transcriptWordSegments.length > 0 && (
              <Tooltip title="AI 优化断句">
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isTranscribing}
                  onClick={handleAIOptimize}
                >
                  <ThunderboltOutlined />
                </button>
              </Tooltip>
            )}

          {/* 字幕挂载按钮 */}
          <Tooltip title={subtitleTooltipTitle}>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!hasTranscriptSegments}
              onClick={handleToggleSubtitle}
            >
              <span
                className={classNames(
                  "text-xs font-semibold leading-none",
                  subtitleMounted && "text-blue-500 dark:text-blue-400",
                )}
              >
                字
              </span>
            </button>
          </Tooltip>

          {/* 总结按钮 */}
          <Tooltip title={isSummarizing ? "正在生成总结..." : "视频总结"}>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSummarizing || isTranscribing}
              onClick={handleSummarize}
            >
              {isSummarizing ? (
                <LoadingOutlined className="animate-spin" />
              ) : (
                <FileText size={16} />
              )}
            </button>
          </Tooltip>
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

              {/* Tab switching & Content section */}
              <div className="flex-1 overflow-hidden border-t border-gray-200 dark:border-gray-700">
                {/* Tab header */}
                <div className="flex h-12 shrink-0 items-center gap-2 border-b border-gray-200 px-4 dark:border-gray-700">
                  <button
                    onClick={() => setActiveTab("transcript")}
                    className={classNames(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 border",
                      activeTab === "transcript"
                        ? [
                            themeColors.activeClass,
                            themeColors.activeTextClass,
                            themeColors.activeBorderClass,
                          ]
                        : [
                            themeColors.cardBgClass,
                            "text-gray-600 dark:text-slate-400",
                            themeColors.cardBorderClass,
                            themeColors.hoverClass,
                          ],
                    )}
                  >
                    <SoundOutlined className="text-xs" />
                    转录
                  </button>
                  <button
                    onClick={() => setActiveTab("summary")}
                    className={classNames(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 border",
                      activeTab === "summary"
                        ? [
                            themeColors.activeClass,
                            themeColors.activeTextClass,
                            themeColors.activeBorderClass,
                          ]
                        : [
                            themeColors.cardBgClass,
                            "text-gray-600 dark:text-slate-400",
                            themeColors.cardBorderClass,
                            themeColors.hoverClass,
                          ],
                    )}
                  >
                    <FileText size={14} />
                    总结
                    {isSummarizing && (
                      <LoadingOutlined className="ml-1 animate-spin text-xs" />
                    )}
                  </button>

                  <div className="ml-auto flex items-center gap-2">
                    {/* 放大查看按钮 */}
                    {activeTab === "summary" &&
                      (summaryContent || videoNote?.summary) &&
                      !isSummarizing && (
                        <Tooltip title="放大查看">
                          <button
                            className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                            onClick={() => setSummaryModalOpen(true)}
                          >
                            <Expand size={16} />
                          </button>
                        </Tooltip>
                      )}
                    {/* 取消按钮 */}
                    {isSummarizing && (
                      <button
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                        onClick={handleCancelSummary}
                      >
                        <CloseOutlined />
                        <span>取消</span>
                      </button>
                    )}
                  </div>
                </div>

                <div
                  ref={transcriptContainerRef}
                  className="h-[calc(100%-3rem)] overflow-auto border-24 pr-2 border-transparent"
                >
                  {activeTab === "transcript" && (
                    <>
                      {isTranscribing ? (
                        <div className="flex h-full flex-col">
                          {isOptimizing && streamingSegments.length > 0 ? (
                            <div className="flex-1 space-y-1 overflow-auto">
                              {streamingSegments.map((segment, index) => (
                                <div
                                  key={`${segment.start}-${index}`}
                                  className={`flex cursor-pointer gap-3 rounded-md p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 ${
                                    segment.status === "pending"
                                      ? "opacity-70"
                                      : ""
                                  }`}
                                  onClick={() =>
                                    handleSegmentClick({
                                      text: segment.text,
                                      start: segment.start,
                                      end: segment.end ?? segment.start + 5000,
                                    })
                                  }
                                >
                                  <span className="shrink-0 font-mono text-xs leading-5 text-blue-500 dark:text-blue-400">
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
                              <span className="text-sm">
                                {transcriptionProgress}
                              </span>
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
                          {videoNote.transcriptSegments.map(
                            (segment, index) => (
                              <div
                                key={index}
                                ref={(el) => {
                                  if (el) segmentRefsMap.current.set(index, el);
                                  else segmentRefsMap.current.delete(index);
                                }}
                                className={classNames(
                                  "group flex items-start gap-3 rounded-md p-2 transition-colors",
                                  currentSegmentIndex === index
                                    ? "bg-blue-100 dark:bg-blue-900/30"
                                    : "hover:bg-gray-100 dark:hover:bg-gray-800",
                                )}
                              >
                                <span
                                  className="shrink-0 cursor-pointer font-mono text-xs leading-5 text-blue-500 dark:text-blue-400"
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
                            ),
                          )}
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
                          <span className="text-sm">
                            点击"转录"按钮生成视频字幕
                          </span>
                        </div>
                      )}
                    </>
                  )}

                  {activeTab === "summary" && (
                    <div className="h-full">
                      {isSummarizing || summaryContent ? (
                        <Editor
                          key={`summary-streaming-${videoNoteId}-${summarySessionId}`}
                          ref={summaryEditorRef}
                          initValue={
                            summaryContent || [
                              {
                                type: "paragraph",
                                children: [
                                  {
                                    type: "formatted",
                                    text: "正在生成总结...",
                                  },
                                ],
                              },
                            ]
                          }
                          extensions={summaryExtensions}
                          readonly={true}
                          features={{ disableHeaderCollapse: true }}
                        />
                      ) : videoNote.summary ? (
                        <Editor
                          ref={summaryEditorRef}
                          key={`summary-saved-${videoNoteId}`}
                          initValue={importFromMarkdown(videoNote.summary)}
                          extensions={summaryExtensions}
                          readonly={true}
                          features={{ disableHeaderCollapse: true }}
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400">
                          <FileText size={24} />
                          <span className="text-sm">
                            点击"总结"按钮生成视频摘要
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
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

      {/* 总结放大查看弹窗 */}
      <CustomModal
        open={summaryModalOpen}
        onCancel={() => setSummaryModalOpen(false)}
        width={900}
        title="视频总结"
        subtitle={isSummarizing ? "正在生成..." : "查看和编辑总结内容"}
        icon={<FileText size={20} className="text-blue-500" />}
        iconBgColor="bg-blue-50 dark:bg-blue-500/20 border-blue-200 dark:border-blue-500/30"
        footer={null}
      >
        <div className="px-5 pb-5">
          {(summaryContent || videoNote?.summary) && (
            <Editor
              ref={modalSummaryEditorRef}
              key={`summary-modal-${videoNoteId}-${summarySessionId}`}
              initValue={
                isSummarizing && summaryContent
                  ? summaryContent
                  : finalSummary
                    ? importFromMarkdown(finalSummary)
                    : videoNote?.summary
                      ? importFromMarkdown(videoNote.summary)
                      : [
                          {
                            type: "paragraph",
                            children: [{ type: "formatted", text: "" }],
                          },
                        ]
              }
              extensions={summaryExtensions}
              readonly={!isModalEditable}
              onChange={isModalEditable ? handleSummaryChange : undefined}
              features={{ disableHeaderCollapse: true }}
            />
          )}
        </div>
      </CustomModal>
    </div>
  );
};

export default VideoNoteView;
