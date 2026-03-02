import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  EditOutlined,
  CommentOutlined,
  SoundOutlined,
  LoadingOutlined,
  CloseOutlined,
  ThunderboltOutlined,
  GlobalOutlined,
  BookOutlined,
} from "@ant-design/icons";
import {
  Pencil,
  FileText,
  Expand,
  Pause,
  Play,
  Plus,
  ArrowUp,
  ArrowLeft,
} from "lucide-react";
import { App, Tooltip, Spin, Empty, Select } from "antd";
import { useMemoizedFn, useThrottleFn } from "ahooks";
import classNames from "classnames";
import { Descendant } from "slate";
import { Editor, EditorRef } from "@tau/editor/src";
import { importFromMarkdown, getMarkdown } from "@/utils/markdown";
import { formatDate } from "@/utils";
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
  getVideoNoteItemsByVideoNoteId,
  createVideoNoteItem,
  updateVideoNoteItem,
  deleteVideoNoteItem,
  getContentById,
  createContent,
  updateContent,
  updateVideoNoteTranscript,
  updateVideoNoteSummary,
  updateVideoNoteHighlights,
  updateVideoNoteInsights,
  getProjectItemById,
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
import { useTopicHighlights } from "@/hooks/useTopicHighlights";
import { useVideoInsights } from "@/hooks/useVideoInsights";
import { getBilibiliCacheStatus } from "@/commands/bilibili-cache";
import { getRemoteVideoCacheStatus } from "@/commands/remote-video-cache";
import { getYoutubeCacheStatus } from "@/commands/youtube-cache";
import { getNotionCacheStatus } from "@/commands/notion-cache";
import {
  type VideoNote as IVideoNote,
  type VideoNoteItem,
  type TranscriptSegment,
  type VideoNoteHighlight,
  type VideoNoteTopic,
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
import VideoNoteChatPanel from "./VideoNoteChatPanel";
import {
  VIDEO_NOTE_AUTO_LANGUAGE,
  resolveVideoNoteOptimizationLanguage,
} from "./transcription-language";
import { computeTranscriptHash } from "@/hooks/video-insights-parser";
import VideoNoteEpubExportModal from "./VideoNoteEpubExportModal";
import { useProjectContext } from "../ProjectContext";

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
const HIGHLIGHT_COLORS = [
  "#66c2a5",
  "#e78ac3",
  "#9c89d9",
  "#88c9d8",
  "#f0c66e",
  "#f28b82",
  "#7aa2f7",
  "#8bd3dd",
];
const normalizeTopicInput = (value: string): string =>
  value.trim().replace(/\s+/g, " ").slice(0, 60);

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
  const activeDatabase = useSettingStore(
    (state) => state.setting.database.active,
  );
  const { itemId: activeProjectItemId } = useProjectContext();

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
    providerConfig: ebookRewriteProviderConfig,
    modelConfig: ebookRewriteModelConfig,
  } = useLLMConfig("videoEbookRewrite");
  const {
    isSummarizing,
    summaryContent,
    finalSummary,
    startSummary,
    stopSummary,
    error: summaryError,
  } = useVideoSummary(summaryProviderConfig, summaryModelConfig);
  const { isGenerating: isGeneratingInsights, generateInsights } =
    useVideoInsights(summaryProviderConfig, summaryModelConfig);
  const { isGenerating: isGeneratingTopicHighlights, generateTopicHighlights } =
    useTopicHighlights(summaryProviderConfig, summaryModelConfig);

  // State
  const [videoNote, setVideoNote] = useState<IVideoNote | null>(null);
  const [noteItems, setNoteItems] = useState<VideoNoteItem[]>([]);
  const [activeNoteItemId, setActiveNoteItemId] = useState<number | null>(null);
  const [noteContentMap, setNoteContentMap] = useState<
    Record<number, Descendant[]>
  >({});
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
  const [activeTab, setActiveTab] = useState<
    "transcript" | "summary" | "chat" | "note"
  >("transcript");
  const [noteViewMode, setNoteViewMode] = useState<"list" | "edit">("list");
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [ebookExportModalOpen, setEbookExportModalOpen] = useState(false);
  const [projectItemTitle, setProjectItemTitle] = useState("");
  const [transcriptionLanguage, setTranscriptionLanguage] = useState<string>(
    VIDEO_NOTE_AUTO_LANGUAGE,
  ); // 默认自动识别
  const [detectedTranscriptionLanguage, setDetectedTranscriptionLanguage] =
    useState<string | null>(null);
  const [subtitleMounted, setSubtitleMounted] = useState(false);
  const [subtitleTrackUrl, setSubtitleTrackUrl] = useState("");
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [isTopicInputOpen, setIsTopicInputOpen] = useState(false);
  const [topicInputValue, setTopicInputValue] = useState("");
  const [selectedHighlightId, setSelectedHighlightId] = useState<string | null>(
    null,
  );
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [playAllIndex, setPlayAllIndex] = useState<number>(-1);
  const [currentVideoTimeMs, setCurrentVideoTimeMs] = useState(0);
  const [videoDurationMs, setVideoDurationMs] = useState(0);

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
  const topicInputWrapperRef = useRef<HTMLDivElement | null>(null);
  const topicInputRef = useRef<HTMLInputElement | null>(null);

  // Summary session ID to force re-render when starting new summary
  const [summarySessionId, setSummarySessionId] = useState(0);

  const activeNoteItem = useMemo(
    () => noteItems.find((item) => item.id === activeNoteItemId) || null,
    [noteItems, activeNoteItemId],
  );
  const activeNoteContent = useMemo(
    () =>
      activeNoteItem
        ? noteContentMap[activeNoteItem.id] || createEmptyEditorContent()
        : createEmptyEditorContent(),
    [activeNoteItem, noteContentMap],
  );
  const transcriptForChat = useMemo(() => {
    if (!videoNote) {
      return "";
    }
    if (videoNote.transcript?.trim()) {
      return videoNote.transcript;
    }
    if (videoNote.transcriptSegments?.length) {
      return videoNote.transcriptSegments.map((item) => item.text).join(" ");
    }
    return "";
  }, [videoNote]);
  const currentTranscriptHash = useMemo(
    () =>
      computeTranscriptHash(
        videoNote?.transcript,
        videoNote?.transcriptSegments,
      ),
    [videoNote?.transcript, videoNote?.transcriptSegments],
  );
  const hasInsights = useMemo(() => {
    const topics = videoNote?.insights?.topics || [];
    const highlights = videoNote?.insights?.highlights || [];
    return topics.length > 0 && highlights.length > 0;
  }, [videoNote?.insights]);
  const sortedHighlights = useMemo<VideoNoteHighlight[]>(() => {
    const source = hasInsights
      ? videoNote?.insights?.highlights
      : videoNote?.highlights;
    const list = Array.isArray(source) ? [...source] : [];
    return list.sort((a, b) => a.start - b.start);
  }, [hasInsights, videoNote?.insights?.highlights, videoNote?.highlights]);
  const allTopics = useMemo<VideoNoteTopic[]>(
    () => (hasInsights ? videoNote?.insights?.topics || [] : []),
    [hasInsights, videoNote?.insights?.topics],
  );
  const selectedTopic = useMemo(
    () => allTopics.find((topic) => topic.id === selectedTheme) || null,
    [allTopics, selectedTheme],
  );
  const allThemes = useMemo(
    () => allTopics.map((topic) => topic.name),
    [allTopics],
  );
  const visibleHighlights = useMemo(
    () =>
      hasInsights && selectedTheme
        ? sortedHighlights.filter((item) => item.topicId === selectedTheme)
        : sortedHighlights,
    [hasInsights, selectedTheme, sortedHighlights],
  );
  const isInsightsObsolete = useMemo(() => {
    if (!videoNote?.insights) {
      return false;
    }
    return videoNote.insights.transcriptHash !== currentTranscriptHash;
  }, [videoNote?.insights, currentTranscriptHash]);
  const playQueue = useMemo(
    () => [...visibleHighlights].sort((a, b) => a.start - b.start),
    [visibleHighlights],
  );

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
      setDetectedTranscriptionLanguage(null);
      try {
        const note = await getVideoNoteById(videoNoteId);
        if (!note) {
          message.error("视频笔记不存在");
          return;
        }
        setVideoNote(note);

        const items = await getVideoNoteItemsByVideoNoteId(videoNoteId);
        setNoteItems(items);
        const firstItemId = items[0]?.id ?? null;
        setActiveNoteItemId(firstItemId);

        const nextContentMap: Record<number, Descendant[]> = {};
        for (const item of items) {
          const content = await getContentById(item.contentId);
          nextContentMap[item.id] =
            content?.content || createEmptyEditorContent();
        }
        setNoteContentMap(nextContentMap);
      } catch (error) {
        console.error("Failed to load video note:", error);
        message.error("加载失败");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [videoNoteId, message]);

  useEffect(() => {
    if (!activeProjectItemId) {
      setProjectItemTitle("");
      return;
    }

    getProjectItemById(activeProjectItemId)
      .then((projectItem) => {
        setProjectItemTitle(projectItem?.title || "");
      })
      .catch((error) => {
        console.error("Failed to load project item title:", error);
      });
  }, [activeProjectItemId]);

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

  useEffect(() => {
    if (
      selectedTheme &&
      !allTopics.some((topic) => topic.id === selectedTheme)
    ) {
      setSelectedTheme(null);
    }
  }, [selectedTheme, allTopics]);

  useEffect(() => {
    if (
      selectedHighlightId &&
      !visibleHighlights.some((item) => item.id === selectedHighlightId)
    ) {
      setSelectedHighlightId(null);
    }
  }, [selectedHighlightId, visibleHighlights]);

  useEffect(() => {
    if (!isPlayingAll) {
      return;
    }
    if (playQueue.length === 0) {
      setIsPlayingAll(false);
      setPlayAllIndex(-1);
      return;
    }
    if (playAllIndex >= playQueue.length) {
      setPlayAllIndex(0);
    }
  }, [isPlayingAll, playAllIndex, playQueue]);

  useEffect(() => {
    if (!isTopicInputOpen) {
      return;
    }
    requestAnimationFrame(() => {
      topicInputRef.current?.focus();
      topicInputRef.current?.select();
    });
  }, [isTopicInputOpen]);

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
    if (!activeNoteItem) {
      return;
    }
    setNoteContentMap((prev) => ({
      ...prev,
      [activeNoteItem.id]: content,
    }));
    throttleSaveContent(activeNoteItem.contentId, content);
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
  const createNewNoteItem = useMemoizedFn(async () => {
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
      setNoteItems((prev) => [...prev, item]);
      setActiveNoteItemId(item.id);
      setNoteContentMap((prev) => ({
        ...prev,
        [item.id]: emptyContent,
      }));
      return item;
    } catch (error) {
      console.error("Failed to create note item:", error);
      message.error("创建笔记失败");
      return null;
    }
  });

  const handleAddNote = useMemoizedFn(async () => {
    const item = await createNewNoteItem();
    if (item) {
      setActiveTab("note");
      setNoteViewMode("edit");
      requestAnimationFrame(() => {
        editorRef.current?.focus();
      });
    }
  });

  const handleSelectNoteItem = useMemoizedFn((itemId: number) => {
    setActiveNoteItemId(itemId);
    setNoteViewMode("edit");
  });

  const handleBackToNoteList = useMemoizedFn(() => {
    setNoteViewMode("list");
  });

  const handleUpdateNoteTitle = useMemoizedFn(
    async (itemId: number, title: string) => {
      try {
        const updated = await updateVideoNoteItem({
          id: itemId,
          title,
        });
        setNoteItems((prev) =>
          prev.map((item) => (item.id === itemId ? updated : item)),
        );
      } catch (error) {
        console.error("Failed to update note title:", error);
      }
    },
  );

  const handleChangeNoteTitle = useMemoizedFn(
    (itemId: number, title: string) => {
      setNoteItems((prev) =>
        prev.map((item) => (item.id === itemId ? { ...item, title } : item)),
      );
    },
  );

  const handleBlurNoteTitle = useMemoizedFn((itemId: number, title: string) => {
    handleUpdateNoteTitle(itemId, title.trim());
  });

  const handleDeleteNote = useMemoizedFn((itemId: number) => {
    modal.confirm({
      title: "删除笔记卡片",
      content: "确定删除该笔记卡片吗？",
      okText: "确定",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
      onOk: async () => {
        await deleteVideoNoteItem(itemId);
        setNoteItems((prev) => {
          const nextItems = prev.filter((item) => item.id !== itemId);
          setActiveNoteItemId((current) => {
            if (current !== itemId) {
              return current;
            }
            const nextActiveItemId = nextItems[0]?.id ?? null;
            if (!nextActiveItemId) {
              setNoteViewMode("list");
            }
            return nextActiveItemId;
          });
          return nextItems;
        });
        setNoteContentMap((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
      },
    });
  });

  const handleGenerateInsights = useMemoizedFn(
    async (segments?: TranscriptSegment[]) => {
      if (!segments || segments.length === 0) {
        return;
      }
      try {
        const insights = await generateInsights(segments, transcriptForChat);
        await Promise.all([
          updateVideoNoteInsights(videoNoteId, insights),
          updateVideoNoteHighlights(videoNoteId, insights.highlights),
        ]);
        setVideoNote((prev) =>
          prev
            ? {
                ...prev,
                highlights: insights.highlights,
                insights,
              }
            : null,
        );
      } catch (error) {
        console.error("Failed to generate insights:", error);
        message.error("主题高亮生成失败，请重试");
      }
    },
  );

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
        language: transcriptionLanguage, // 自动识别模式会透传为 auto
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
        const detectedLanguage = result.data.language || null;
        setDetectedTranscriptionLanguage(detectedLanguage);
        const optimizationLanguage = resolveVideoNoteOptimizationLanguage(
          transcriptionLanguage,
          detectedLanguage,
        );

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
          // 启动流式优化，自动模式优先使用本次检测语言
          startOptimization(result.data.wordSegments, optimizationLanguage);
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
          void handleGenerateInsights(finalSegments);
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
          void handleGenerateInsights(optimizedFinalSegments);

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
    handleGenerateInsights,
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

    const optimizationLanguage = resolveVideoNoteOptimizationLanguage(
      transcriptionLanguage,
      detectedTranscriptionLanguage,
    );
    // 启动流式优化，自动模式下无检测结果时回退中文
    startOptimization(videoNote.transcriptWordSegments, optimizationLanguage);
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
        void handleGenerateInsights(newSegments);
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

  const handleOpenEbookExportModal = useMemoizedFn(() => {
    setEbookExportModalOpen(true);
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

      if (!video) {
        return;
      }

      const currentTimeMs = video.currentTime * 1000;
      setCurrentVideoTimeMs(currentTimeMs);
      if (Number.isFinite(video.duration) && video.duration > 0) {
        setVideoDurationMs(video.duration * 1000);
      }

      if (isPlayingAll && !video.paused && playQueue.length > 0) {
        const currentIndex = playAllIndex >= 0 ? playAllIndex : 0;
        const currentHighlight = playQueue[currentIndex];
        if (currentHighlight && currentTimeMs >= currentHighlight.end - 120) {
          const nextIndex = currentIndex + 1;
          if (nextIndex < playQueue.length) {
            const nextHighlight = playQueue[nextIndex];
            setPlayAllIndex(nextIndex);
            setSelectedHighlightId(nextHighlight.id);
            video.currentTime = nextHighlight.start / 1000;
            void video.play().catch(() => {});
          } else {
            stopPlayAll();
          }
        }
      }

      // 只有在 transcript tab 激活且视频正在播放时才处理转录高亮滚动
      if (segments?.length && !video.paused && activeTab === "transcript") {
        const newIndex = findCurrentSegmentIndex(currentTimeMs, segments);
        if (newIndex !== null && newIndex !== currentSegmentIndex) {
          const shouldScroll = checkShouldAutoScroll(currentSegmentIndex);
          setCurrentSegmentIndex(newIndex);
          if (shouldScroll) {
            scrollToSegment(newIndex);
          }
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

  useEffect(() => {
    if (isPlayingAll || visibleHighlights.length === 0) {
      return;
    }
    const current = visibleHighlights.find(
      (item) =>
        currentVideoTimeMs >= item.start && currentVideoTimeMs <= item.end,
    );
    if (current) {
      setSelectedHighlightId((prev) =>
        prev === current.id ? prev : current.id,
      );
    }
  }, [currentVideoTimeMs, isPlayingAll, visibleHighlights]);

  const handleSegmentClick = useCallback((segment: TranscriptSegment) => {
    if (videoElementRef.current) {
      videoElementRef.current.currentTime = segment.start / 1000;
      videoElementRef.current.play().catch(() => {});
    }
  }, []);

  const stopPlayAll = useMemoizedFn(() => {
    setIsPlayingAll(false);
    setPlayAllIndex(-1);
  });

  const playHighlight = useMemoizedFn(
    (highlight: VideoNoteHighlight, keepPlayAll = false) => {
      if (!keepPlayAll) {
        stopPlayAll();
      }
      setSelectedHighlightId(highlight.id);
      if (videoElementRef.current) {
        videoElementRef.current.currentTime = highlight.start / 1000;
        void videoElementRef.current.play().catch(() => {});
      }
    },
  );

  const handleThemeSelect = useMemoizedFn((theme: string | null) => {
    setSelectedTheme(theme);
    stopPlayAll();
  });

  const handleCreateCustomTheme = useMemoizedFn(async () => {
    const normalized = normalizeTopicInput(topicInputValue);
    if (!normalized) {
      return;
    }
    if (!videoNote?.transcriptSegments?.length) {
      message.warning("请先完成转录再创建主题");
      return;
    }
    try {
      const mergedInsights = await generateTopicHighlights(
        normalized,
        videoNote.transcriptSegments,
        transcriptForChat,
        videoNote.insights,
      );
      await Promise.all([
        updateVideoNoteInsights(videoNoteId, mergedInsights),
        updateVideoNoteHighlights(videoNoteId, mergedInsights.highlights),
      ]);

      const createdTopic =
        mergedInsights.topics.find(
          (topic) => topic.name.toLowerCase() === normalized.toLowerCase(),
        ) || mergedInsights.topics[mergedInsights.topics.length - 1];
      setVideoNote((prev) =>
        prev
          ? {
              ...prev,
              highlights: mergedInsights.highlights,
              insights: mergedInsights,
            }
          : null,
      );
      setSelectedTheme(createdTopic?.id || null);
      setTopicInputValue("");
      setIsTopicInputOpen(false);
      stopPlayAll();
    } catch (error) {
      console.error("Failed to create custom topic highlights:", error);
      message.error("主题提取失败，请重试");
    }
  });

  const handleProgressSeek = useMemoizedFn(
    (event: React.MouseEvent<HTMLDivElement>, durationMs: number) => {
      if (!durationMs || durationMs <= 0 || !videoElementRef.current) {
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = Math.min(
        Math.max((event.clientX - rect.left) / rect.width, 0),
        1,
      );
      const nextMs = ratio * durationMs;
      videoElementRef.current.currentTime = nextMs / 1000;
      setCurrentVideoTimeMs(nextMs);
      stopPlayAll();
    },
  );

  const handlePlayAllToggle = useMemoizedFn(() => {
    if (playQueue.length === 0) {
      return;
    }
    if (isPlayingAll) {
      stopPlayAll();
      if (videoElementRef.current && !videoElementRef.current.paused) {
        videoElementRef.current.pause();
      }
      return;
    }

    setIsPlayingAll(true);
    setPlayAllIndex(0);
    playHighlight(playQueue[0], true);
  });

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
  const progressDurationMs = Math.max(
    videoDurationMs,
    videoNote.transcriptSegments?.[videoNote.transcriptSegments.length - 1]
      ?.end || 0,
    sortedHighlights[sortedHighlights.length - 1]?.end || 0,
  );
  const currentProgressRatio =
    progressDurationMs > 0
      ? Math.min(Math.max(currentVideoTimeMs / progressDurationMs, 0), 1)
      : 0;
  const subtitleTooltipTitle = !hasTranscriptSegments
    ? "请先转录后再挂载字幕"
    : subtitleMounted
      ? "已挂载字幕（可关闭）"
      : "挂载字幕";
  const subtitleLanguage = resolveVideoNoteOptimizationLanguage(
    transcriptionLanguage,
    detectedTranscriptionLanguage,
  );
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

          <Tooltip title="AI 导出电子书">
            <button
              className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              onClick={handleOpenEbookExportModal}
            >
              <BookOutlined />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Main content */}
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

              <div className="min-h-0 flex-1 overflow-y-auto border-t border-gray-200 dark:border-gray-700">
                <div className="flex min-h-full flex-col gap-3 px-4 py-3">
                  <div className="shrink-0 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        高亮区
                      </span>
                      <span className="text-xs text-gray-400">
                        {visibleHighlights.length}
                        {selectedTopic
                          ? ` / ${sortedHighlights.length}`
                          : ""}{" "}
                        条
                      </span>
                    </div>
                    <button
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={
                        !hasTranscriptSegments ||
                        isGeneratingInsights ||
                        isGeneratingTopicHighlights
                      }
                      onClick={() =>
                        handleGenerateInsights(videoNote.transcriptSegments)
                      }
                    >
                      {isGeneratingInsights ? (
                        <LoadingOutlined className="animate-spin" />
                      ) : (
                        <ThunderboltOutlined />
                      )}
                      <span>重新生成</span>
                    </button>
                  </div>

                  {isInsightsObsolete && (
                    <div className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300">
                      转录内容已变化，当前主题高亮结果可能过期。请点击“重新生成”更新。
                    </div>
                  )}
                  {!hasInsights && sortedHighlights.length > 0 && (
                    <div className="shrink-0 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-300">
                      当前为兼容模式（仅旧 highlights）。建议重新生成以获得 AI
                      主题与精确偏移。
                    </div>
                  )}

                  <div className="shrink-0 flex items-center gap-2 overflow-x-auto pb-1">
                    {isTopicInputOpen ? (
                      <div
                        ref={topicInputWrapperRef}
                        className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-1 dark:bg-gray-800"
                      >
                        <input
                          ref={topicInputRef}
                          value={topicInputValue}
                          onChange={(event) =>
                            setTopicInputValue(event.target.value)
                          }
                          placeholder="输入主题词"
                          className="w-25 border-0 bg-transparent text-sm text-gray-700 outline-none dark:text-gray-200"
                          onBlur={(event) => {
                            const nextTarget =
                              event.relatedTarget as Node | null;
                            if (
                              nextTarget &&
                              topicInputWrapperRef.current?.contains(nextTarget)
                            ) {
                              return;
                            }
                            setIsTopicInputOpen(false);
                            setTopicInputValue("");
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              handleCreateCustomTheme();
                            }
                            if (event.key === "Escape") {
                              setIsTopicInputOpen(false);
                              setTopicInputValue("");
                            }
                          }}
                        />
                        <button
                          className="flex h-6 w-6 items-center justify-center rounded-full text-gray-500 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-700"
                          disabled={isGeneratingTopicHighlights}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={handleCreateCustomTheme}
                        >
                          {isGeneratingTopicHighlights ? (
                            <LoadingOutlined className="text-xs animate-spin" />
                          ) : (
                            <ArrowUp size={14} />
                          )}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="flex shrink-0 items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                        disabled={
                          !hasTranscriptSegments || isGeneratingTopicHighlights
                        }
                        onClick={() => setIsTopicInputOpen(true)}
                      >
                        <Plus size={14} />
                        Your Topic
                      </button>
                    )}

                    <button
                      type="button"
                      className={classNames(
                        "shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors",
                        !selectedTheme
                          ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700",
                      )}
                      onClick={() => handleThemeSelect(null)}
                    >
                      Overall highlights
                    </button>
                    {allTopics.map((topic) => (
                      <button
                        key={topic.id}
                        type="button"
                        className={classNames(
                          "shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors",
                          selectedTheme === topic.id
                            ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700",
                        )}
                        onClick={() =>
                          handleThemeSelect(
                            selectedTheme === topic.id ? null : topic.id,
                          )
                        }
                      >
                        {topic.name}
                      </button>
                    ))}
                  </div>

                  <div
                    className="shrink-0 relative h-16 cursor-pointer overflow-hidden rounded-2xl bg-gray-100 dark:bg-gray-800"
                    onClick={(event) =>
                      handleProgressSeek(event, progressDurationMs)
                    }
                  >
                    {progressDurationMs > 0 &&
                      visibleHighlights.map((highlight, index) => {
                        const left =
                          (highlight.start / progressDurationMs) * 100;
                        const width = Math.max(
                          ((highlight.end - highlight.start) /
                            progressDurationMs) *
                            100,
                          0.8,
                        );
                        const color =
                          HIGHLIGHT_COLORS[index % HIGHLIGHT_COLORS.length];
                        const isSelected = selectedHighlightId === highlight.id;
                        return (
                          <button
                            key={`progress-${highlight.id}`}
                            type="button"
                            className={classNames(
                              "absolute top-2 h-12 rounded-lg transition-all",
                              isSelected
                                ? "ring-2 ring-white/80 dark:ring-gray-900"
                                : "hover:opacity-100",
                            )}
                            style={{
                              left: `${left}%`,
                              width: `${width}%`,
                              backgroundColor: color,
                              opacity: isSelected ? 1 : 0.75,
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              playHighlight(highlight);
                            }}
                          />
                        );
                      })}
                    <div
                      className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 bg-red-500"
                      style={{ left: `${currentProgressRatio * 100}%` }}
                    >
                      <div className="absolute -left-1.5 -top-1 h-3 w-3 rounded-full bg-red-500" />
                    </div>
                  </div>

                  <div className="min-h-[120px] flex-1 overflow-auto pr-1">
                    {visibleHighlights.length > 0 ? (
                      <div className="space-y-2">
                        {visibleHighlights.map((highlight, index) => {
                          const color =
                            HIGHLIGHT_COLORS[index % HIGHLIGHT_COLORS.length];
                          const isSelected =
                            selectedHighlightId === highlight.id;
                          return (
                            <div
                              key={highlight.id}
                              className={classNames(
                                "cursor-pointer rounded-xl border px-3 py-2 transition-all",
                                isSelected
                                  ? "border-transparent shadow-sm"
                                  : "border-transparent hover:shadow-sm",
                              )}
                              style={{
                                backgroundColor: isSelected
                                  ? `${color}33`
                                  : `${color}1a`,
                              }}
                              onClick={() => playHighlight(highlight)}
                            >
                              <div className="mb-1 flex items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span
                                    className="h-3 w-3 shrink-0 rounded-full"
                                    style={{ backgroundColor: color }}
                                  />
                                  <span className="line-clamp-1 text-sm font-medium text-gray-800 dark:text-gray-100">
                                    {highlight.title}
                                  </span>
                                </div>
                                <span className="shrink-0 font-mono text-xs text-gray-500 dark:text-gray-300">
                                  {formatTime(highlight.start)}
                                </span>
                              </div>
                              <p className="line-clamp-2 text-xs leading-5 text-gray-600 dark:text-gray-300">
                                {highlight.quote}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400">
                        <ThunderboltOutlined className="text-xl" />
                        <span className="text-sm">
                          {sortedHighlights.length === 0
                            ? hasTranscriptSegments
                              ? "暂未生成高亮，可点击“重新生成”"
                              : "完成转录后会自动生成高亮"
                            : "该主题下暂无匹配高亮，请尝试其他主题"}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center justify-between">
                    <span className="font-mono text-sm text-gray-500 dark:text-gray-300">
                      {formatTime(currentVideoTimeMs)} /{" "}
                      {progressDurationMs > 0
                        ? formatTime(progressDurationMs)
                        : "--:--"}
                    </span>
                    <button
                      type="button"
                      disabled={playQueue.length === 0}
                      className="flex items-center gap-1.5 rounded-full bg-gray-900 px-3 py-1.5 text-sm text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                      onClick={handlePlayAllToggle}
                    >
                      {isPlayingAll ? <Pause size={14} /> : <Play size={14} />}
                      {isPlayingAll ? "Stop" : "Play All"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          }
          right={
            <div className="flex h-full flex-col overflow-hidden">
              <div className="flex h-12 shrink-0 items-center gap-2 border-b border-gray-200 px-4 dark:border-gray-700">
                <button
                  onClick={() => setActiveTab("transcript")}
                  className={classNames(
                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 border",
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
                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 border",
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
                <button
                  disabled={!hasTranscriptSegments}
                  onClick={() => setActiveTab("chat")}
                  className={classNames(
                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 border disabled:cursor-not-allowed disabled:opacity-50",
                    activeTab === "chat"
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
                  <CommentOutlined className="text-xs" />
                  对话
                </button>
                <button
                  onClick={() => setActiveTab("note")}
                  className={classNames(
                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 border",
                    activeTab === "note"
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
                  <EditOutlined className="text-xs" />
                  笔记
                </button>

                <div className="ml-auto flex items-center gap-2">
                  {activeTab === "summary" &&
                    (videoNote?.summary || summaryContent || isSummarizing) && (
                      <Tooltip
                        title={
                          isSummarizing ? "正在生成总结..." : "重新生成视频总结"
                        }
                      >
                        <button
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-blue-500 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-blue-900/20"
                          disabled={
                            isSummarizing ||
                            isTranscribing ||
                            !videoNote?.transcriptSegments?.length
                          }
                          onClick={handleSummarize}
                        >
                          {isSummarizing ? (
                            <LoadingOutlined className="animate-spin" />
                          ) : (
                            <FileText size={14} />
                          )}
                          <span>重新生成</span>
                        </button>
                      </Tooltip>
                    )}
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
                  {activeTab === "summary" && isSummarizing && (
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

              <div className="min-h-0 flex-1 overflow-hidden">
                {activeTab === "transcript" && (
                  <div
                    ref={transcriptContainerRef}
                    className="h-full overflow-auto border-24 border-transparent pr-2"
                  >
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
                        <span className="text-sm">
                          点击"转录"按钮生成视频字幕
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "summary" && (
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="min-h-0 flex-1 overflow-auto">
                      {isSummarizing && !summaryContent ? (
                        <div className="flex h-full items-center justify-center">
                          <LoadingOutlined className="text-3xl text-gray-400 animate-spin" />
                        </div>
                      ) : isSummarizing || summaryContent ? (
                        <div className="p-6">
                          <Editor
                            key={`summary-streaming-${videoNoteId}-${summarySessionId}`}
                            ref={summaryEditorRef}
                            initValue={
                              summaryContent || createEmptyEditorContent()
                            }
                            extensions={summaryExtensions}
                            readonly={true}
                            features={{ disableHeaderCollapse: true }}
                          />
                        </div>
                      ) : videoNote.summary ? (
                        <div className="p-6">
                          <Editor
                            ref={summaryEditorRef}
                            key={`summary-saved-${videoNoteId}`}
                            initValue={importFromMarkdown(videoNote.summary)}
                            extensions={summaryExtensions}
                            readonly={true}
                            features={{ disableHeaderCollapse: true }}
                          />
                        </div>
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-3 text-gray-400">
                          <FileText size={24} />
                          <span className="text-sm">
                            生成当前视频的结构化摘要与重点结论
                          </span>
                          <Tooltip
                            title={
                              isSummarizing ? "正在生成总结..." : "生成视频总结"
                            }
                          >
                            <button
                              className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-blue-500 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-blue-900/20"
                              disabled={
                                isSummarizing ||
                                isTranscribing ||
                                !videoNote?.transcriptSegments?.length
                              }
                              onClick={handleSummarize}
                            >
                              {isSummarizing ? (
                                <LoadingOutlined className="animate-spin" />
                              ) : (
                                <FileText size={14} />
                              )}
                              <span>生成总结</span>
                            </button>
                          </Tooltip>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === "chat" && (
                  <div className="h-full">
                    {hasTranscriptSegments ? (
                      <VideoNoteChatPanel
                        videoNoteId={videoNoteId}
                        mainDbName={activeDatabase}
                        transcript={transcriptForChat}
                        selectedTheme={selectedTopic?.name || null}
                        visibleHighlights={visibleHighlights}
                        availableThemes={allThemes}
                        topics={allTopics}
                        insightsObsolete={isInsightsObsolete}
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400">
                        <SoundOutlined className="text-2xl" />
                        <span className="text-sm">
                          需要先完成转录，才可开启对话
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "note" && (
                  <div className="flex h-full min-h-0 flex-col overflow-auto p-4">
                    {noteViewMode === "edit" && activeNoteItem && (
                      <div className="mx-auto flex h-full w-full max-w-4xl min-h-0 flex-col">
                        <div
                          className={classNames(
                            "mb-3 flex items-center gap-3 border-b px-1 pb-2",
                            themeColors.borderClass,
                          )}
                        >
                          <button
                            type="button"
                            className={classNames(
                              "flex h-8 w-8 items-center justify-center rounded-md transition-all",
                              themeColors.textClass,
                              themeColors.hoverClass,
                            )}
                            onClick={handleBackToNoteList}
                          >
                            <ArrowLeft size={14} />
                          </button>
                          <input
                            value={activeNoteItem.title || ""}
                            placeholder="请输入标题"
                            className={classNames(
                              "min-w-0 flex-1 border-none bg-transparent p-0 text-base font-medium outline-none placeholder:text-gray-400",
                              themeColors.activeTextClass,
                            )}
                            onChange={(event) =>
                              handleChangeNoteTitle(
                                activeNoteItem.id,
                                event.target.value,
                              )
                            }
                            onBlur={(event) =>
                              handleBlurNoteTitle(
                                activeNoteItem.id,
                                event.target.value,
                              )
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                (event.target as HTMLInputElement).blur();
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="rounded-lg px-2 py-1 text-xs text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={() => handleDeleteNote(activeNoteItem.id)}
                          >
                            删除
                          </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-auto px-5">
                          <Editor
                            key={`video-note-item-${activeNoteItem.id}`}
                            ref={editorRef}
                            initValue={activeNoteContent}
                            onChange={handleEditorChange}
                            extensions={customExtensions}
                            readonly={false}
                            placeHolder="开始记录这张笔记卡片..."
                            onInit={handleEditorInit}
                          />
                        </div>
                      </div>
                    )}

                    {!(noteViewMode === "edit" && activeNoteItem) && (
                      <div className="mx-auto flex h-full w-full max-w-4xl min-h-0 flex-col">
                        <div className="mb-3 flex shrink-0 items-center justify-between">
                          <h4
                            className={classNames(
                              "m-0 text-sm font-semibold",
                              themeColors.textClass,
                            )}
                          >
                            创作内容
                          </h4>
                          <button
                            type="button"
                            className={classNames(
                              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                              themeColors.cardBgClass,
                              themeColors.cardBorderClass,
                              themeColors.hoverClass,
                              themeColors.textClass,
                            )}
                            onClick={handleAddNote}
                          >
                            <Plus size={14} />
                            新建卡片
                          </button>
                        </div>

                        {noteItems.length > 0 ? (
                          <div className="min-h-0 space-y-2 overflow-auto pr-1">
                            {noteItems.map((item, index) => {
                              const isActive = item.id === activeNoteItemId;
                              return (
                                <div
                                  key={item.id}
                                  className={classNames(
                                    "group relative rounded-xl border p-3 transition-all",
                                    themeColors.cardBgClass,
                                    isActive
                                      ? [
                                          themeColors.activeClass,
                                          themeColors.activeBorderClass,
                                        ]
                                      : [
                                          themeColors.cardBorderClass,
                                          themeColors.hoverBorderClass,
                                        ],
                                  )}
                                >
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-3 pr-14 border-none bg-transparent text-left"
                                    onClick={() =>
                                      handleSelectNoteItem(item.id)
                                    }
                                  >
                                    <EditOutlined className="text-[13px] text-gray-500 dark:text-gray-400" />
                                    <span
                                      className={classNames(
                                        "line-clamp-1 min-w-0 flex-1 text-sm font-medium",
                                        themeColors.activeTextClass,
                                      )}
                                    >
                                      {item.title?.trim() ||
                                        `笔记卡片 ${index + 1}`}
                                    </span>
                                    <span
                                      className={classNames(
                                        "shrink-0 text-xs",
                                        themeColors.secondaryTextClass,
                                      )}
                                    >
                                      {formatDate(item.updateTime, true)}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-1.5 py-1 text-xs text-red-500 opacity-0 transition-all hover:bg-red-50 group-hover:opacity-100 dark:hover:bg-red-900/20"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleDeleteNote(item.id);
                                    }}
                                  >
                                    删除
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div
                            className={classNames(
                              "flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed",
                              themeColors.cardBorderClass,
                            )}
                          >
                            <EditOutlined className="text-lg text-gray-400" />
                            <span
                              className={classNames(
                                "text-sm",
                                themeColors.secondaryTextClass,
                              )}
                            >
                              暂无笔记卡片
                            </span>
                            <button
                              type="button"
                              className={classNames(
                                "rounded-lg px-3 py-1.5 text-xs transition-all",
                                themeColors.primaryButtonClass,
                              )}
                              onClick={handleAddNote}
                            >
                              点击创建第一张笔记卡片
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
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

      <VideoNoteEpubExportModal
        open={ebookExportModalOpen}
        onClose={() => setEbookExportModalOpen(false)}
        videoNoteId={videoNoteId}
        transcript={transcriptForChat}
        videoTitle={projectItemTitle || videoNote?.description || "视频电子书"}
        videoDescription={videoNote?.description || ""}
        providerConfig={ebookRewriteProviderConfig}
        modelConfig={ebookRewriteModelConfig}
        onOpenLLMSettings={() => openSettingsModal("llm")}
      />
    </div>
  );
};

export default VideoNoteView;
