import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Pencil,
  FileText,
  Plus,
  ArrowLeft,
  MessageCircle,
  Trash2,
  StickyNote,
  Subtitles,
  Volume2,
  LoaderCircle,
  X,
  Zap,
  BookText,
} from "lucide-react";
import { ConfirmDialog, Tooltip, toast } from "@tau/ui";
import { useMemoizedFn, useThrottleFn } from "ahooks";
import { FadeScroll } from "@tau/ui";
import classNames from "classnames";
import { Descendant, Node } from "slate";
import { EditorRef } from "@tau/editor";
import Editor from "@/components/ContentEditor";
import { formatDate } from "@/utils";
import type { CustomEditor } from "@tau/editor";
import EditTitleModal from "@/components/EditTitleModal";
import useUploadResource from "@/hooks/useUploadResource.ts";
import useSettingStore from "@/stores/useSettingStore";
import {
  getVideoNoteById,
  getVideoNoteItemsByVideoNoteId,
  createVideoNoteItem,
  updateVideoNoteItem,
  deleteVideoNoteItem,
  getContentById,
  createContent,
  updateVideoNoteTranscript,
} from "@/commands";
import { openLLMSettingsSection } from "@/utils/transcription";
import { useLLMConfig } from "@/hooks/useLLMConfig";
import { type VideoNote as IVideoNote, type VideoNoteItem, type TranscriptSegment } from "@/types";
import {} from "@/editor-extensions";
import { createVideoTimestampExtension } from "./extensions/VideoTimestamp";
import { createVideoScreenshotExtension } from "./extensions/VideoScreenshot";
import { VideoController } from "./VideoController";
import VideoNoteChatPanel from "./VideoNoteChatPanel";
import LanguageSelect from "./LanguageSelect";
import { TRANSCRIPTION_LANGUAGES, VIDEO_NOTE_AUTO_LANGUAGE } from "./transcription-language";
import { useVideoNoteTranscription } from "./useVideoNoteTranscription";
import VideoNoteEpubExportModal from "./VideoNoteEpubExportModal";

const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

const createEmptyEditorContent = (): Descendant[] =>
  JSON.parse(JSON.stringify(DEFAULT_CONTENT)) as Descendant[];

const getNotePreview = (content: Descendant[] | undefined): string => {
  if (!content || content.length === 0) return "";
  for (const node of content) {
    const text = Node.string(node).trim();
    if (text) return text;
  }
  return "";
};

interface VideoNotePanelProps {
  videoNoteId: number;
  externalVideoElement?: HTMLVideoElement | null;
  videoTitle?: string;
  transcriptionLanguage?: string;
  onTranscriptionLanguageChange?: (language: string) => void;
  onVideoNoteChange?: (videoNote: IVideoNote) => void;
  subtitleMounted?: boolean;
  onSubtitleMountedChange?: (mounted: boolean) => void;
  reserveCloseButtonSpace?: boolean;
}

const VideoNotePanel = ({
  videoNoteId,
  externalVideoElement,
  videoTitle,
  transcriptionLanguage: controlledTranscriptionLanguage,
  onTranscriptionLanguageChange,
  onVideoNoteChange,
  subtitleMounted,
  onSubtitleMountedChange,
  reserveCloseButtonSpace = false,
}: VideoNotePanelProps) => {
  const uploadResource = useUploadResource();
  const activeDatabase = useSettingStore(state => state.setting.database.active);

  const { provider: ebookRewriteLLMProviderSetting, model: ebookRewriteLLMModelSetting } =
    useLLMConfig("videoEbookRewrite");
  // State
  const [videoNote, setVideoNote] = useState<IVideoNote | null>(null);
  const [noteItems, setNoteItems] = useState<VideoNoteItem[]>([]);
  const [activeNoteItemId, setActiveNoteItemId] = useState<number | null>(null);
  const [noteContentMap, setNoteContentMap] = useState<Record<number, Descendant[]>>({});
  const [loading, setLoading] = useState(true);
  const [editingSegmentIndex, setEditingSegmentIndex] = useState<number | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"transcript" | "chat" | "note">("transcript");
  const [noteViewMode, setNoteViewMode] = useState<"list" | "edit">("list");
  const [ebookExportModalOpen, setEbookExportModalOpen] = useState(false);
  const [internalTranscriptionLanguage, setInternalTranscriptionLanguage] =
    useState<string>(VIDEO_NOTE_AUTO_LANGUAGE);
  const transcriptionLanguage = controlledTranscriptionLanguage ?? internalTranscriptionLanguage;
  const handleTranscriptionLanguageChange = useMemoizedFn((language: string) => {
    if (controlledTranscriptionLanguage === undefined) {
      setInternalTranscriptionLanguage(language);
    }
    onTranscriptionLanguageChange?.(language);
  });
  const {
    isTranscribing,
    progress: transcriptionProgress,
    isOptimizing,
    streamingSegments,
    transcribe: handleTranscribe,
    optimize: handleAIOptimize,
    cancelOptimization: handleCancelOptimization,
    llmConfirm: transcriptionLlmConfirm,
    dismissLlmConfirm,
  } = useVideoNoteTranscription({
    videoNote,
    language: transcriptionLanguage,
    onTranscriptSaved: patch => setVideoNote(prev => (prev ? { ...prev, ...patch } : null)),
  });

  // 当前高亮的转录片段索引（用于视频播放时的同步高亮）
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState<number | null>(null);

  // Refs
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  // 转录列表容器的 ref，用于判断视口
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  // 存储每个 segment DOM 元素的 ref
  const segmentRefsMap = useRef<Map<number, HTMLDivElement>>(new Map());
  const editorRef = useRef<EditorRef>(null);
  const slateEditorRef = useRef<CustomEditor | null>(null);

  const activeNoteItem = useMemo(
    () => noteItems.find(item => item.id === activeNoteItemId) || null,
    [noteItems, activeNoteItemId]
  );
  const activeNoteContent = useMemo(
    () =>
      activeNoteItem
        ? noteContentMap[activeNoteItem.id] || createEmptyEditorContent()
        : createEmptyEditorContent(),
    [activeNoteItem, noteContentMap]
  );
  const transcriptForChat = useMemo(() => {
    if (!videoNote) {
      return "";
    }
    if (videoNote.transcript?.trim()) {
      return videoNote.transcript;
    }
    if (videoNote.transcriptSegments?.length) {
      return videoNote.transcriptSegments.map(item => item.text).join(" ");
    }
    return "";
  }, [videoNote]);
  // 用于存储 timeupdate 事件处理函数的 ref（避免 callback ref 的依赖问题）
  const timeUpdateHandlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (videoElementRef.current && timeUpdateHandlerRef.current) {
      videoElementRef.current.removeEventListener("timeupdate", timeUpdateHandlerRef.current);
    }

    videoElementRef.current = externalVideoElement ?? null;

    if (externalVideoElement && timeUpdateHandlerRef.current) {
      externalVideoElement.addEventListener("timeupdate", timeUpdateHandlerRef.current);
    }

    return () => {
      if (externalVideoElement && timeUpdateHandlerRef.current) {
        externalVideoElement.removeEventListener("timeupdate", timeUpdateHandlerRef.current);
      }
    };
  }, [externalVideoElement]);

  useEffect(() => {
    if (videoNote) {
      onVideoNoteChange?.(videoNote);
    }
  }, [videoNote, onVideoNoteChange]);

  // Video controller for timestamp functionality
  const videoController = useMemo(() => {
    return new VideoController(
      () => videoElementRef.current,
      async (file: File) => {
        const path = await uploadResource(file);
        return path || null;
      }
    );
  }, [uploadResource]);

  // Custom extensions for editor
  const customExtensions = useMemo(() => {
    return [
      createVideoTimestampExtension(videoController),
      createVideoScreenshotExtension(videoController),
    ];
  }, [videoController]);

  // Load video note data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const note = await getVideoNoteById(videoNoteId);
        if (!note) {
          toast.error("视频笔记不存在");
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
          nextContentMap[item.id] = content?.content || createEmptyEditorContent();
        }
        setNoteContentMap(nextContentMap);
      } catch (error) {
        console.error("Failed to load video note:", error);
        toast.error("加载失败");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [videoNoteId]);

  // Handle editor content change
  const handleEditorChange = useMemoizedFn((content: Descendant[]) => {
    if (!activeNoteItem) {
      return;
    }
    setNoteContentMap(prev => ({
      ...prev,
      [activeNoteItem.id]: content,
    }));
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
      setNoteItems(prev => [...prev, item]);
      setActiveNoteItemId(item.id);
      setNoteContentMap(prev => ({
        ...prev,
        [item.id]: emptyContent,
      }));
      return item;
    } catch (error) {
      console.error("Failed to create note item:", error);
      toast.error("创建笔记失败");
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

  const handleUpdateNoteTitle = useMemoizedFn(async (itemId: number, title: string) => {
    try {
      const updated = await updateVideoNoteItem({
        id: itemId,
        title,
      });
      setNoteItems(prev => prev.map(item => (item.id === itemId ? updated : item)));
    } catch (error) {
      console.error("Failed to update note title:", error);
    }
  });

  const handleChangeNoteTitle = useMemoizedFn((itemId: number, title: string) => {
    setNoteItems(prev => prev.map(item => (item.id === itemId ? { ...item, title } : item)));
  });

  const handleBlurNoteTitle = useMemoizedFn((itemId: number, title: string) => {
    handleUpdateNoteTitle(itemId, title.trim());
  });

  // 受控确认弹窗的待确认项（替代 antd modal.confirm）
  const [pendingDeleteNoteId, setPendingDeleteNoteId] = useState<number | null>(null);

  const handleDeleteNote = useMemoizedFn((itemId: number) => {
    setPendingDeleteNoteId(itemId);
  });

  const confirmDeleteNote = async () => {
    const itemId = pendingDeleteNoteId;
    setPendingDeleteNoteId(null);
    if (itemId == null) return;
    await deleteVideoNoteItem(itemId);
    setNoteItems(prev => {
      const nextItems = prev.filter(item => item.id !== itemId);
      setActiveNoteItemId(current => {
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
    setNoteContentMap(prev => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

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
    setVideoNote(prev =>
      prev
        ? {
            ...prev,
            transcriptSegments: newSegments,
            transcript: newSegments.map(s => s.text).join(" "),
          }
        : null
    );

    // 保存到数据库
    try {
      await updateVideoNoteTranscript(
        videoNoteId,
        newSegments.map(s => s.text).join(" "),
        newSegments,
        videoNote.transcriptWordSegments
      );
    } catch (error) {
      console.error("Failed to save edited segment:", error);
      toast.error("保存失败");
    }

    // 清除编辑状态
    setEditModalOpen(false);
    setEditingSegmentIndex(null);
  });

  const handleOpenEbookExportModal = useMemoizedFn(() => {
    setEbookExportModalOpen(true);
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
        if (nextSegment && currentTimeMs >= segment.end && currentTimeMs < nextSegment.start) {
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
    []
  );

  // 检查是否需要自动滚动（仅当前一个高亮句子在视口中时才滚动）
  const checkShouldAutoScroll = useCallback((prevIndex: number | null): boolean => {
    // 如果没有前一个高亮句子，不滚动
    if (prevIndex === null) return false;

    const container = transcriptContainerRef.current;
    const prevElement = segmentRefsMap.current.get(prevIndex);

    if (!container || !prevElement) return false;

    // 检查前一个元素是否在容器的可视区域内
    const containerRect = container.getBoundingClientRect();
    const elementRect = prevElement.getBoundingClientRect();

    return elementRect.top >= containerRect.top && elementRect.bottom <= containerRect.bottom;
  }, []);

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
    { wait: 100 }
  );

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

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4">
        <div className="relative h-10 w-10">
          <span className="absolute inset-0 rounded-full border-2 border-gray-200 dark:border-slate-700" />
          <span
            className={classNames(
              "absolute inset-0 animate-spin rounded-full border-2 border-transparent",
              "text-accent"
            )}
            style={{ borderTopColor: "currentColor" }}
          />
        </div>
        <span className={classNames("text-sm", "text-ink-2")}>加载中...</span>
      </div>
    );
  }

  if (!videoNote) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-8 text-center">
        <div
          className={classNames(
            "flex h-14 w-14 items-center justify-center rounded-2xl",
            "bg-hover",
            "text-accent"
          )}
        >
          <FileText size={26} />
        </div>
        <p className={classNames("text-sm font-medium", "text-ink-1")}>视频笔记不存在</p>
        <p className={classNames("text-xs", "text-ink-2")}>该笔记可能已被删除或加载异常</p>
      </div>
    );
  }

  const hasTranscriptSegments = !!videoNote?.transcriptSegments?.length;

  const videoNotePanel = (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-gray-200 px-4 dark:border-gray-700">
        <div className="flex items-center gap-0.5 rounded-lg bg-black/5 p-0.5 dark:bg-white/5">
          <button
            onClick={() => setActiveTab("transcript")}
            className={classNames(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200",
              activeTab === "transcript"
                ? ["bg-accent-soft text-accent-text", "text-accent-text", "shadow-sm"]
                : [
                    "text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-200",
                  ]
            )}
          >
            <Volume2 size={12} />
            转录
          </button>
          <button
            disabled={!hasTranscriptSegments}
            onClick={() => setActiveTab("chat")}
            className={classNames(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40",
              activeTab === "chat"
                ? ["bg-accent-soft text-accent-text", "text-accent-text", "shadow-sm"]
                : [
                    "text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-200",
                  ]
            )}
          >
            <MessageCircle size={12} />
            对话
          </button>
          <button
            onClick={() => setActiveTab("note")}
            className={classNames(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200",
              activeTab === "note"
                ? ["bg-accent-soft text-accent-text", "text-accent-text", "shadow-sm"]
                : [
                    "text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-200",
                  ]
            )}
          >
            <Pencil size={12} />
            笔记
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === "transcript" && (
          <FadeScroll
            scrollRef={transcriptContainerRef}
            className="mb-4 h-[calc(100%-16px)] pb-1 pl-6 pr-[18px] pt-5"
          >
            {isTranscribing ? (
              <div className="flex h-full flex-col">
                {isOptimizing && streamingSegments.length > 0 ? (
                  <div className="flex-1 space-y-1">
                    {streamingSegments.map((segment, index) => (
                      <div
                        key={`${segment.start}-${index}`}
                        className={`flex cursor-pointer gap-3 rounded-md p-2 transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800 ${
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
                        <span className="shrink-0 font-mono text-xs leading-5 text-[var(--tau-accent)]">
                          {formatTime(segment.start)}
                        </span>
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {segment.text}
                        </span>
                        {segment.status === "pending" && (
                          <LoaderCircle size={12} className="text-ink-3 ml-auto animate-spin" />
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-500">
                    <LoaderCircle size={24} className="animate-spin" />
                    <span className="text-sm">{transcriptionProgress}</span>
                  </div>
                )}
                {isOptimizing && (
                  <div className="mt-4 flex justify-center border-t border-gray-200 pt-4 dark:border-gray-700">
                    <button
                      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                      onClick={handleCancelOptimization}
                    >
                      <X size={14} strokeWidth={1.75} />
                      <span>取消优化</span>
                    </button>
                  </div>
                )}
              </div>
            ) : videoNote.transcriptSegments && videoNote.transcriptSegments.length > 0 ? (
              <div className="space-y-1">
                {videoNote.transcriptSegments.map((segment, index) => (
                  <div
                    key={index}
                    ref={el => {
                      if (el) segmentRefsMap.current.set(index, el);
                      else segmentRefsMap.current.delete(index);
                    }}
                    className={classNames(
                      "group flex items-start gap-3 rounded-md p-2 transition-colors",
                      currentSegmentIndex === index ? "bg-info-soft" : "hover:bg-hover"
                    )}
                  >
                    <span
                      className="shrink-0 cursor-pointer font-mono text-xs leading-5 text-[var(--tau-accent)]"
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
                      className="invisible flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-600 group-hover:visible dark:hover:bg-zinc-700 dark:hover:text-gray-300"
                      onClick={e => {
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
                <Volume2 size={24} />
                <span className="text-sm">点击"转录"按钮生成视频字幕</span>
              </div>
            )}
          </FadeScroll>
        )}

        {activeTab === "chat" && (
          <div className="h-full">
            {hasTranscriptSegments ? (
              <VideoNoteChatPanel
                videoNoteId={videoNoteId}
                mainDbName={activeDatabase}
                transcript={transcriptForChat}
                docked
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
                <div
                  className={classNames(
                    "flex h-14 w-14 items-center justify-center rounded-2xl",
                    "bg-hover",
                    "text-accent"
                  )}
                >
                  <MessageCircle size={26} />
                </div>
                <div className="space-y-1">
                  <p className={classNames("text-sm font-medium", "text-ink-1")}>
                    需要先完成转录，才可开启对话
                  </p>
                  <p className={classNames("text-xs", "text-ink-2")}>
                    完成转录后，即可基于视频内容向 AI 提问
                  </p>
                </div>
                <button
                  type="button"
                  className={classNames(
                    "mt-1 flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50",
                    "bg-accent text-ink-inverse hover:bg-accent-hover active:brightness-95"
                  )}
                  disabled={isTranscribing || !videoNote}
                  onClick={handleTranscribe}
                >
                  {isTranscribing ? (
                    <LoaderCircle size={14} className="animate-spin" />
                  ) : (
                    <Volume2 size={12} />
                  )}
                  <span>{isTranscribing ? "转录中..." : "开始转录"}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === "note" && (
          <div className="flex h-full min-h-0 flex-col overflow-hidden p-4">
            {noteViewMode === "edit" && activeNoteItem && (
              <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col">
                <div
                  className={classNames(
                    "mb-3 flex items-center gap-3 border-b px-1 pb-2",
                    "border-line-1"
                  )}
                >
                  <button
                    type="button"
                    className={classNames(
                      "flex h-8 w-8 items-center justify-center rounded-md transition-all",
                      "text-ink-1",
                      "hover:bg-hover"
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
                      "text-accent-text"
                    )}
                    onChange={event => handleChangeNoteTitle(activeNoteItem.id, event.target.value)}
                    onBlur={event => handleBlurNoteTitle(activeNoteItem.id, event.target.value)}
                    onKeyDown={event => {
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
                <FadeScroll className="min-h-0 flex-1 pb-2 pl-5 pr-3.5">
                  <Editor
                    key={`video-note-item-${activeNoteItem.id}`}
                    contentId={activeNoteItem.contentId}
                    ref={editorRef}
                    initValue={activeNoteContent}
                    onChange={handleEditorChange}
                    extensions={customExtensions}
                    readonly={false}
                    placeHolder="开始记录这张笔记卡片..."
                    onInit={handleEditorInit}
                  />
                </FadeScroll>
              </div>
            )}

            {!(noteViewMode === "edit" && activeNoteItem) && (
              <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col">
                <div className="mb-3 flex shrink-0 items-center justify-between">
                  <h4 className={classNames("m-0 text-sm font-semibold", "text-ink-1")}>
                    创作内容
                  </h4>
                  <button
                    type="button"
                    className={classNames(
                      "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                      "bg-surface",
                      "border-line-1",
                      "hover:bg-hover",
                      "text-ink-1"
                    )}
                    onClick={handleAddNote}
                  >
                    <Plus size={14} />
                    新建卡片
                  </button>
                </div>

                {noteItems.length > 0 ? (
                  <FadeScroll className="min-h-0 space-y-1.5 pb-1">
                    {noteItems.map((item, index) => {
                      const isActive = item.id === activeNoteItemId;
                      const preview = getNotePreview(noteContentMap[item.id]);
                      return (
                        <div
                          key={item.id}
                          role="button"
                          tabIndex={0}
                          className={classNames(
                            "group relative cursor-pointer rounded-lg px-3 py-2.5 outline-none transition-all",
                            isActive
                              ? "bg-gray-100 dark:bg-zinc-800"
                              : [
                                  "hover:bg-gray-100/70 dark:hover:bg-zinc-800/60",
                                  "focus-visible:bg-gray-100/70 dark:focus-visible:bg-zinc-800/60",
                                ]
                          )}
                          onClick={() => handleSelectNoteItem(item.id)}
                          onKeyDown={event => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              handleSelectNoteItem(item.id);
                            }
                          }}
                        >
                          <div className="flex items-center gap-2.5">
                            <span
                              className={classNames(
                                "w-4 shrink-0 text-right text-xs font-medium tabular-nums",
                                isActive
                                  ? "text-gray-600 dark:text-gray-300"
                                  : "text-gray-400 dark:text-gray-500"
                              )}
                            >
                              {index + 1}
                            </span>
                            <span
                              className={classNames(
                                "min-w-0 flex-1 truncate text-sm font-medium",
                                isActive
                                  ? "text-gray-900 dark:text-white"
                                  : "text-gray-700 dark:text-gray-200"
                              )}
                            >
                              {item.title?.trim() || `笔记卡片 ${index + 1}`}
                            </span>
                            <span
                              className={classNames(
                                "shrink-0 text-xs tabular-nums opacity-50 transition-opacity group-hover:opacity-100",
                                "text-gray-400 dark:text-gray-500"
                              )}
                            >
                              {formatDate(item.updateTime, true)}
                            </span>
                            <button
                              type="button"
                              className={classNames(
                                "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 opacity-0 transition-all group-hover:opacity-100",
                                "hover:text-red-500"
                              )}
                              onClick={event => {
                                event.stopPropagation();
                                handleDeleteNote(item.id);
                              }}
                              title="删除"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          {preview && (
                            <p
                              className={classNames(
                                "mt-1 line-clamp-1 pl-[26px] text-xs",
                                isActive
                                  ? "text-gray-600 dark:text-gray-300"
                                  : "text-gray-400 dark:text-gray-500"
                              )}
                            >
                              {preview}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </FadeScroll>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
                    <div
                      className={classNames(
                        "flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg",
                        "bg-hover",
                        "text-accent"
                      )}
                      style={{
                        boxShadow: "0 10px 30px -10px var(--tau-bg-surface, rgba(0,0,0,0.15))",
                      }}
                    >
                      <StickyNote size={28} />
                    </div>
                    <div className="space-y-1.5">
                      <p className={classNames("text-base font-semibold", "text-ink-1")}>
                        还没有笔记卡片
                      </p>
                      <p className={classNames("text-sm", "text-ink-2")}>
                        创建卡片，边看视频边记录灵感与思考
                      </p>
                    </div>
                    <button
                      type="button"
                      className={classNames(
                        "mt-1 flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all",
                        "bg-accent text-ink-inverse hover:bg-accent-hover active:brightness-95"
                      )}
                      onClick={handleAddNote}
                    >
                      <Plus size={16} />
                      创建第一张卡片
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const videoNoteOverlays = (
    <>
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

      <VideoNoteEpubExportModal
        open={ebookExportModalOpen}
        onClose={() => setEbookExportModalOpen(false)}
        videoNoteId={videoNoteId}
        transcript={transcriptForChat}
        videoTitle={videoTitle || videoNote?.description || "视频电子书"}
        videoDescription={videoNote?.description || ""}
        provider={ebookRewriteLLMProviderSetting}
        model={ebookRewriteLLMModelSetting}
        onOpenLLMSettings={() => openLLMSettingsSection()}
      />
    </>
  );

  return (
    <div className="flex h-full w-full flex-col">
      <div
        className={classNames(
          "flex h-12 shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 dark:border-gray-700",
          reserveCloseButtonSpace ? "pr-14" : ""
        )}
      >
        <LanguageSelect
          value={transcriptionLanguage}
          onChange={handleTranscriptionLanguageChange}
          options={TRANSCRIPTION_LANGUAGES}
          disabled={isTranscribing}
          placeholder="转录语言"
        />
        <div className="flex items-center gap-1.5">
          <Tooltip content={isTranscribing ? transcriptionProgress : "转录视频"}>
            <button
              className={classNames(
                "flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50",
                "bg-accent text-ink-inverse hover:bg-accent-hover active:brightness-95"
              )}
              disabled={isTranscribing || !videoNote}
              onClick={handleTranscribe}
            >
              {isTranscribing ? (
                <LoaderCircle size={14} className="animate-spin" />
              ) : (
                <Volume2 size={12} />
              )}
              <span>{isTranscribing ? "转录中" : "转录"}</span>
            </button>
          </Tooltip>
          {videoNote?.transcriptWordSegments && videoNote.transcriptWordSegments.length > 0 && (
            <Tooltip content="AI 优化断句">
              <button
                className={classNames(
                  "flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-all disabled:cursor-not-allowed disabled:opacity-50",
                  "bg-surface",
                  "border-line-1",
                  "hover:bg-hover",
                  "text-ink-1"
                )}
                disabled={isTranscribing}
                onClick={handleAIOptimize}
              >
                <Zap size={12} />
              </button>
            </Tooltip>
          )}
          <Tooltip content="AI 导出电子书">
            <button
              className={classNames(
                "flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-all",
                "bg-surface",
                "border-line-1",
                "hover:bg-hover",
                "text-ink-1"
              )}
              onClick={handleOpenEbookExportModal}
            >
              <BookText size={12} />
            </button>
          </Tooltip>
          {onSubtitleMountedChange && (
            <Tooltip
              content={
                !hasTranscriptSegments
                  ? "请先转录后再挂载字幕"
                  : subtitleMounted
                    ? "已挂载字幕（可关闭）"
                    : "挂载字幕"
              }
            >
              <button
                className={classNames(
                  "flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-all disabled:cursor-not-allowed disabled:opacity-50",
                  subtitleMounted
                    ? ["bg-accent-soft text-accent-text", "text-accent-text"]
                    : ["bg-surface", "border-line-1", "hover:bg-hover", "text-ink-1"]
                )}
                disabled={!hasTranscriptSegments}
                onClick={() => onSubtitleMountedChange(!subtitleMounted)}
              >
                <Subtitles size={15} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{videoNotePanel}</div>
      {videoNoteOverlays}
      <ConfirmDialog
        open={pendingDeleteNoteId != null}
        onOpenChange={v => !v && setPendingDeleteNoteId(null)}
        danger
        title="删除笔记卡片"
        description="确定删除该笔记卡片吗？"
        confirmText="删除"
        onConfirm={confirmDeleteNote}
      />
      <ConfirmDialog
        open={transcriptionLlmConfirm != null}
        onOpenChange={v => !v && dismissLlmConfirm()}
        title={transcriptionLlmConfirm?.title ?? ""}
        description={transcriptionLlmConfirm?.description ?? ""}
        confirmText="打开设置"
        onConfirm={() => {
          dismissLlmConfirm();
          openLLMSettingsSection();
        }}
      />
    </div>
  );
};

export default VideoNotePanel;
