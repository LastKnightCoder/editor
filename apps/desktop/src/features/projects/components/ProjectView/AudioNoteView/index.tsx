import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Volume2, Loader2, Zap } from "lucide-react";
import { FileText, Pencil, ChevronDown, Sparkles } from "lucide-react";
import { useMemoizedFn, useThrottleFn } from "ahooks";
import classNames from "classnames";
import { Descendant } from "slate";
import { EditorRef } from "@tau/editor/src";
import Editor from "@/components/ContentEditor";
import { importFromMarkdown } from "@/utils/markdown";
import ResizablePanel from "@/components/ResizablePanel";
import {
  getAudioNoteById,
  getAudioNoteItemsByAudioNoteId,
  createAudioNoteItem,
  getContentById,
  createContent,
  updateAudioNoteTranscript,
  updateAudioNoteSummary,
  updateAudioNoteInsights,
  updateAudioNoteChapters,
} from "@/commands";
import {
  transcribeAudio,
  onTranscriptionProgress,
  shouldSegmentAudio,
  transcribeAudioSegmented,
} from "@/commands/transcription";
import {
  checkTranscriptionLLMRequirement,
  openLLMSettingsSection,
  prepareTranscriptionOptions,
} from "@/utils/transcription";
import { useLLMConfig } from "@/hooks/useLLMConfig";
import { useTranscriptionOptimization } from "@/hooks/useTranscriptionOptimization";
import { useVideoSummary } from "@/hooks/useVideoSummary";
import { useVideoInsights } from "@/hooks/useVideoInsights";
import { AudioControllerImpl } from "./AudioController";
import { resolveAudioPathForTranscription } from "./audio-source";
import AudioPlayer from "./components/AudioPlayer";
import ChaptersPanel from "./components/ChaptersPanel";
import useSettingStore from "@/stores/useSettingStore";
import { AudioNote, AudioNoteItem, TranscriptSegment, AudioChapter } from "@/types";
import { toast, ConfirmDialog } from "@tau/ui";
import {
  VIDEO_NOTE_AUTO_LANGUAGE,
  resolveVideoNoteOptimizationLanguage,
} from "@/components/VideoNotePanel/transcription-language";

type TabKey = "transcript" | "highlights" | "summary" | "note";

const TRANSCRIPTION_LANGUAGES = [
  { value: "auto", label: "自动检测" },
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
];

interface AudioNoteViewProps {
  audioNoteId: number;
  title?: string;
}

const AudioNoteView = ({ audioNoteId, title: projectItemTitle }: AudioNoteViewProps) => {
  const { setting } = useSettingStore(s => ({ setting: s.setting }));

  // Audio state
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioNote, setAudioNote] = useState<AudioNote | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  // Tab state
  const [activeTab, setActiveTab] = useState<TabKey>("transcript");

  // Transcription state
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionProgress, setTranscriptionProgress] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState<string>(VIDEO_NOTE_AUTO_LANGUAGE);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement>(null);

  // Summary state
  const [isSummarizing, setIsSummarizing] = useState(false);

  // Note state
  const [noteItems, setNoteItems] = useState<AudioNoteItem[]>([]);
  const [noteContentMap, setNoteContentMap] = useState<Record<number, Descendant[]>>({});
  const [activeNoteItemId, setActiveNoteItemId] = useState<number | null>(null);

  // Segment tracking
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState<number>(-1);
  const segmentRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);
  const autoScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // LLM Config
  const { provider, model } = useLLMConfig("transcriptionOptimization");
  const { provider: summaryLLMProviderSetting, model: summaryLLMModelSetting } =
    useLLMConfig("videoSummary");

  // Transcription optimization
  const {
    isOptimizing,
    streamingSegments,
    finalSegments: optimizedFinalSegments,
    startOptimization,
  } = useTranscriptionOptimization(provider, model);

  // Summary hook
  const {
    isSummarizing: isSummaryStreaming,
    summaryContent: streamingSummaryContent,
    finalSummary,
    startSummary,
  } = useVideoSummary(summaryLLMProviderSetting, summaryLLMModelSetting);

  // Insights hook
  const { isGenerating: isGeneratingInsights, generateInsights } = useVideoInsights(
    summaryLLMProviderSetting,
    summaryLLMModelSetting
  );

  // Audio controller
  const audioController = useMemo(() => new AudioControllerImpl(() => audioRef.current), []);

  // Extensions

  // Editor ref
  const editorRef = useRef<EditorRef>(null);
  const summaryEditorRef = useRef<EditorRef>(null);

  // Load audio note data
  useEffect(() => {
    const loadData = async () => {
      const note = await getAudioNoteById(audioNoteId);
      if (note) {
        setAudioNote(note);
      }

      const items = await getAudioNoteItemsByAudioNoteId(audioNoteId);
      setNoteItems(items);

      if (items.length > 0) {
        setActiveNoteItemId(items[0].id);
        const contentMap: Record<number, Descendant[]> = {};
        for (const item of items) {
          const content = await getContentById(item.contentId);
          if (content) {
            contentMap[item.contentId] = content.content as Descendant[];
          }
        }
        setNoteContentMap(contentMap);
      }
    };
    loadData();
  }, [audioNoteId]);

  // Time update handler
  const { run: handleTimeUpdate } = useThrottleFn(
    (time: number) => {
      setCurrentTimeMs(time * 1000);
      updateCurrentSegment(time * 1000);
    },
    { wait: 100 }
  );

  const handleDurationChange = useCallback((_dur: number) => {}, []);

  // Segment tracking
  const updateCurrentSegment = useCallback(
    (timeMs: number) => {
      if (!audioNote?.transcriptSegments) return;
      const segments = audioNote.transcriptSegments;
      let idx = -1;
      for (let i = 0; i < segments.length; i++) {
        if (timeMs >= segments[i].start && timeMs <= segments[i].end) {
          idx = i;
          break;
        }
        if (timeMs >= segments[i].start) {
          idx = i;
        }
      }
      if (idx !== currentSegmentIndex) {
        setCurrentSegmentIndex(idx);
        if (!userScrolledRef.current) {
          const el = segmentRefs.current.get(idx);
          const container = transcriptContainerRef.current;
          if (el && container) {
            autoScrollingRef.current = true;
            const elTop = el.offsetTop;
            const elHeight = el.offsetHeight;
            const containerHeight = container.clientHeight;
            container.scrollTop = elTop - containerHeight / 2 + elHeight / 2;
            requestAnimationFrame(() => {
              autoScrollingRef.current = false;
            });
          }
        }
      }
    },
    [audioNote?.transcriptSegments, currentSegmentIndex]
  );

  // Detect user manual scroll on transcript container
  useEffect(() => {
    const container = transcriptContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      if (autoScrollingRef.current) return;
      userScrolledRef.current = true;
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        userScrolledRef.current = false;
      }, 5000);
    };
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [activeTab]);

  // Close language menu on outside click
  useEffect(() => {
    if (!showLanguageMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (languageMenuRef.current && !languageMenuRef.current.contains(e.target as Node)) {
        setShowLanguageMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showLanguageMenu]);

  const [llmConfirm, setLlmConfirm] = useState<null | { errorMessage: string }>(null);

  // Transcription
  const handleStartTranscription = useMemoizedFn(async () => {
    if (!audioNote) return;

    const llmRequirement = checkTranscriptionLLMRequirement();
    if (llmRequirement.needsLLM && !llmRequirement.isConfigured) {
      setLlmConfirm({ errorMessage: llmRequirement.errorMessage ?? "LLM 配置不完整" });
      return;
    }

    setIsTranscribing(true);
    setTranscriptionProgress("准备转录...");

    try {
      const audioPath = await resolveAudioPathForTranscription(audioNote.metaInfo, {
        bilibiliCredentials: setting.integration.bilibili.credentials,
        youtubeProxy: setting.integration.youtube.proxy,
      });

      if (!audioPath) {
        toast.error("音频地址为空");
        return;
      }

      const options = prepareTranscriptionOptions({
        language: selectedLanguage,
      });

      const unsubscribe = onTranscriptionProgress(data => {
        setTranscriptionProgress(data.message);
      });

      let result;
      try {
        const segmentCheck = await shouldSegmentAudio(audioPath);
        if (segmentCheck.success && segmentCheck.shouldSegment) {
          setTranscriptionProgress("音频较长，将分段转录...");
          result = await transcribeAudioSegmented(audioPath, options);
        } else {
          setTranscriptionProgress("正在转录...");
          result = await transcribeAudio(audioPath, options);
        }
      } finally {
        unsubscribe();
      }

      if (!result.success || !result.data) {
        toast.error(result.error || "转录失败");
        return;
      }

      const { text, segments, wordSegments } = result.data;

      if (options.useLLMOptimization && wordSegments && wordSegments.length > 0) {
        const lang = resolveVideoNoteOptimizationLanguage(selectedLanguage, result.data.language);
        startOptimization(
          wordSegments.map((s: TranscriptSegment) => ({
            text: s.text,
            start: s.start,
            end: s.end,
          })),
          lang
        );
        await updateAudioNoteTranscript(
          audioNoteId,
          text,
          segments.map((s: TranscriptSegment) => ({
            text: s.text,
            start: s.start,
            end: s.end,
          })),
          wordSegments.map((s: TranscriptSegment) => ({
            text: s.text,
            start: s.start,
            end: s.end,
          }))
        );
      } else {
        await updateAudioNoteTranscript(
          audioNoteId,
          text,
          segments.map((s: TranscriptSegment) => ({
            text: s.text,
            start: s.start,
            end: s.end,
          }))
        );
      }

      const updatedNote = await getAudioNoteById(audioNoteId);
      if (updatedNote) {
        setAudioNote(updatedNote);
      }

      toast.success("转录完成");

      if (segments.length > 0) {
        void handleGenerateInsights(
          segments.map((s: TranscriptSegment) => ({
            text: s.text,
            start: s.start,
            end: s.end,
          }))
        );
      }
    } catch (error) {
      console.error(error);
      toast.error("转录失败");
    } finally {
      setIsTranscribing(false);
      setTranscriptionProgress("");
    }
  });

  // Handle optimized segments
  useEffect(() => {
    if (optimizedFinalSegments && optimizedFinalSegments.length > 0) {
      const text = optimizedFinalSegments.map(s => s.text).join("");
      updateAudioNoteTranscript(
        audioNoteId,
        text,
        optimizedFinalSegments,
        audioNote?.transcriptWordSegments
      ).then(async () => {
        const updated = await getAudioNoteById(audioNoteId);
        if (updated) setAudioNote(updated);
      });
    }
  }, [optimizedFinalSegments]);

  // Generate insights / chapters
  const handleGenerateInsights = useMemoizedFn(async (segments: TranscriptSegment[]) => {
    if (!summaryLLMProviderSetting || !summaryLLMModelSetting) {
      console.warn("[AudioNote] 跳过章节生成：视频总结模型未配置");
      toast.info("提示：配置「视频总结」模型后可自动生成章节");
      return;
    }

    try {
      const result = await generateInsights(segments);
      if (result) {
        await updateAudioNoteInsights(audioNoteId, result);
        if (result.topics && result.topics.length > 0) {
          const chapters: AudioChapter[] = result.topics.map(
            (topic: { id: string; name: string; summary?: string }) => {
              const topicHighlights = (result.highlights || []).filter(
                (h: { topicId?: string }) => h.topicId === topic.id
              );
              const startTime =
                topicHighlights.length > 0
                  ? Math.min(...topicHighlights.map((h: { start: number }) => h.start))
                  : 0;
              const endTime =
                topicHighlights.length > 0
                  ? Math.max(...topicHighlights.map((h: { end: number }) => h.end))
                  : 0;
              return {
                id: topic.id,
                title: topic.name,
                startTime,
                endTime,
                summary: topic.summary,
              };
            }
          );
          chapters.sort((a, b) => a.startTime - b.startTime);
          await updateAudioNoteChapters(audioNoteId, chapters);
        }

        const updated = await getAudioNoteById(audioNoteId);
        if (updated) setAudioNote(updated);
      }
    } catch (e) {
      console.error("[AudioNote] 章节生成失败:", e);
      toast.error("章节生成失败");
    }
  });

  // Summary
  const handleStartSummary = useMemoizedFn(() => {
    if (!audioNote?.transcriptSegments) {
      toast.warning("请先完成转录");
      return;
    }
    setIsSummarizing(true);
    setActiveTab("summary");
    startSummary(audioNote.transcriptSegments);
  });

  // Save summary when done
  useEffect(() => {
    if (finalSummary && isSummarizing) {
      updateAudioNoteSummary(audioNoteId, finalSummary).then(async () => {
        const updated = await getAudioNoteById(audioNoteId);
        if (updated) setAudioNote(updated);
        setIsSummarizing(false);
      });
    }
  }, [finalSummary]);

  // Seek to time
  const handleSeek = useCallback(
    (timeMs: number) => {
      audioController.seekTo(timeMs / 1000);
    },
    [audioController]
  );

  // Create note item
  const handleCreateNoteItem = useMemoizedFn(async () => {
    const defaultContent: Descendant[] = [
      { type: "paragraph", children: [{ type: "formatted", text: "" }] },
    ];
    const contentId = await createContent(defaultContent, 0);
    const item = await createAudioNoteItem({
      audioNoteId,
      contentId: contentId as number,
      title: "",
    });
    setNoteItems(prev => [...prev, item]);
    setActiveNoteItemId(item.id);
    setNoteContentMap(prev => ({
      ...prev,
      [contentId as number]: defaultContent,
    }));
  });

  const handleNoteContentChange = useMemoizedFn((contentId: number, content: Descendant[]) => {
    setNoteContentMap(current => ({ ...current, [contentId]: content }));
  });

  // AI optimize
  const handleAIOptimize = useMemoizedFn(() => {
    if (!audioNote?.transcriptWordSegments?.length) return;
    const lang = resolveVideoNoteOptimizationLanguage(selectedLanguage, undefined);
    startOptimization(
      audioNote.transcriptWordSegments.map(s => ({
        text: s.text,
        start: s.start,
        end: s.end,
      })),
      lang
    );
  });

  // Transcript segments
  const transcriptSegments = audioNote?.transcriptSegments || [];
  const chapters = audioNote?.chapters || [];
  const highlights = audioNote?.insights?.highlights || [];

  // Summary content - use streaming content from hook or saved summary
  const summaryContent = useMemo(() => {
    if (isSummaryStreaming && streamingSummaryContent) {
      return streamingSummaryContent;
    }
    const text = finalSummary || audioNote?.summary || "";
    if (!text) return null;
    return importFromMarkdown(text);
  }, [isSummaryStreaming, streamingSummaryContent, finalSummary, audioNote?.summary]);

  // Update summary editor during streaming
  useEffect(() => {
    if (summaryContent && summaryEditorRef.current) {
      summaryEditorRef.current.setEditorValue(summaryContent);
    }
  }, [summaryContent]);

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    {
      key: "transcript",
      label: "转录",
      icon: <Volume2 className="size-3.5" strokeWidth={1.75} />,
    },
    { key: "highlights", label: "高亮", icon: <Sparkles size={14} /> },
    { key: "summary", label: "总结", icon: <FileText size={14} /> },
    { key: "note", label: "笔记", icon: <Pencil size={14} /> },
  ];

  const selectedLangLabel =
    TRANSCRIPTION_LANGUAGES.find(l => l.value === selectedLanguage)?.label || "自动检测";

  if (!audioNote) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="text-ink-3 size-6 animate-spin" strokeWidth={1.75} />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      {/* Toolbar */}
      <div className="border-line-1 flex h-12 shrink-0 items-center justify-end border-b px-4">
        <div className="flex items-center gap-3">
          {/* Language selector */}
          <div className="relative" ref={languageMenuRef}>
            <button
              className="border-line-1 text-ink-2 hover:bg-hover flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors"
              onClick={() => setShowLanguageMenu(!showLanguageMenu)}
              disabled={isTranscribing}
            >
              {selectedLangLabel}
              <ChevronDown size={12} />
            </button>
            {showLanguageMenu && (
              <div className="border-line-1 bg-surface absolute right-0 top-full z-50 mt-1 min-w-[120px] rounded-lg border py-1 shadow-lg">
                {TRANSCRIPTION_LANGUAGES.map(lang => (
                  <button
                    key={lang.value}
                    className={classNames(
                      "block w-full px-3 py-1.5 text-left text-xs transition-colors",
                      lang.value === selectedLanguage
                        ? "bg-accent-soft text-accent-text font-medium"
                        : "text-ink-2 hover:bg-hover"
                    )}
                    onClick={() => {
                      setSelectedLanguage(lang.value);
                      setShowLanguageMenu(false);
                    }}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Transcribe button */}
          <button
            className="text-ink-2 hover:bg-hover flex h-8 w-8 items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isTranscribing || !audioNote}
            onClick={handleStartTranscription}
            title={isTranscribing ? transcriptionProgress : "转录音频"}
          >
            {isTranscribing ? (
              <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
            ) : (
              <Volume2 className="size-4" strokeWidth={1.75} />
            )}
          </button>

          {/* AI optimize button */}
          {audioNote?.transcriptWordSegments && audioNote.transcriptWordSegments.length > 0 && (
            <button
              className="text-ink-2 hover:bg-hover flex h-8 w-8 items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isTranscribing || isOptimizing}
              onClick={handleAIOptimize}
              title="AI 优化断句"
            >
              <Zap className="size-4" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanel
          id="audio-note-view"
          initialLeftRatio={0.45}
          minLeft={300}
          minRight={400}
          left={
            <div className="flex h-full flex-col">
              <div className="shrink-0 p-4 pb-0">
                <AudioPlayer
                  metaInfo={audioNote.metaInfo}
                  title={projectItemTitle}
                  chapters={chapters}
                  audioRef={audioRef}
                  onTimeUpdate={handleTimeUpdate}
                  onDurationChange={handleDurationChange}
                />
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {chapters.length > 0 ? (
                  <ChaptersPanel
                    chapters={chapters}
                    currentTimeMs={currentTimeMs}
                    onSeek={handleSeek}
                  />
                ) : transcriptSegments.length > 0 ? (
                  <div className="border-line-1 flex flex-col items-center gap-2 rounded-xl border border-dashed py-4">
                    <span className="text-ink-3 text-xs">暂无章节</span>
                    <button
                      className="bg-accent hover:bg-accent-hover flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
                      disabled={isGeneratingInsights}
                      onClick={() => void handleGenerateInsights(transcriptSegments)}
                    >
                      {isGeneratingInsights ? (
                        <>
                          <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
                          生成中...
                        </>
                      ) : (
                        <>
                          <Zap className="size-4" strokeWidth={1.75} />
                          生成章节
                        </>
                      )}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          }
          right={
            <div className="flex h-full flex-col overflow-hidden">
              {/* Tab bar */}
              <div className="border-line-1 flex h-12 shrink-0 items-center gap-2 border-b px-4">
                {tabs.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={classNames(
                      "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all",
                      activeTab === tab.key
                        ? ["bg-accent-soft text-accent-text", "text-accent-text", "border-accent"]
                        : ["bg-surface", "text-ink-2", "border-line-1", "hover:bg-hover"]
                    )}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}

                {/* Right-side actions */}
                <div className="ml-auto flex items-center gap-2">
                  {activeTab === "summary" &&
                    (audioNote?.summary || summaryContent || isSummarizing) && (
                      <button
                        className="text-accent hover:bg-accent-soft flex items-center gap-1 rounded-md px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isSummarizing || isTranscribing || !transcriptSegments.length}
                        onClick={handleStartSummary}
                      >
                        {isSummarizing ? (
                          <>
                            <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
                            <span>生成中...</span>
                          </>
                        ) : (
                          <>
                            <FileText size={14} />
                            <span>重新生成</span>
                          </>
                        )}
                      </button>
                    )}
                </div>
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto p-4" ref={transcriptContainerRef}>
                {/* Transcript tab */}
                {activeTab === "transcript" && (
                  <div className="h-full">
                    {transcriptSegments.length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center gap-4">
                        {isTranscribing ? (
                          <div className="text-ink-2 flex flex-col items-center gap-3">
                            <Loader2 className="size-6 animate-spin" strokeWidth={1.75} />
                            <span className="text-sm">{transcriptionProgress || "转录中..."}</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-4">
                            <div className="text-ink-3 flex flex-col items-center gap-2">
                              <Volume2 className="size-8" strokeWidth={1.75} />
                              <span className="text-sm">暂无转录内容</span>
                            </div>
                            <button
                              className="bg-accent hover:bg-accent-hover flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
                              onClick={handleStartTranscription}
                              disabled={isTranscribing}
                            >
                              <Zap className="size-4" strokeWidth={1.75} />
                              开始转录
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {isOptimizing && streamingSegments.length > 0 ? (
                          <>
                            <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                              <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
                              AI 优化断句中...
                            </div>
                            {streamingSegments.map((segment, index) => (
                              <div
                                key={`${segment.start}-${index}`}
                                className={classNames(
                                  "hover:bg-hover flex cursor-pointer items-start gap-3 rounded-md p-2 transition-colors",
                                  segment.status === "pending" && "opacity-60"
                                )}
                                onClick={() => handleSeek(segment.start)}
                              >
                                <span className="text-accent shrink-0 font-mono text-xs leading-5">
                                  {formatTimeMs(segment.start)}
                                </span>
                                <span className="text-ink-2 flex-1 text-sm leading-5">
                                  {segment.text}
                                </span>
                                {segment.status === "pending" && (
                                  <Loader2
                                    className="text-ink-3 ml-auto size-4 animate-spin"
                                    strokeWidth={1.75}
                                  />
                                )}
                              </div>
                            ))}
                          </>
                        ) : (
                          <>
                            {isOptimizing && (
                              <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
                                AI 优化断句中...
                              </div>
                            )}
                            {transcriptSegments.map((segment, idx) => (
                              <div
                                key={idx}
                                ref={el => {
                                  if (el) segmentRefs.current.set(idx, el);
                                }}
                                className={classNames(
                                  "group flex cursor-pointer items-start gap-3 rounded-md p-2 transition-colors",
                                  idx === currentSegmentIndex ? "bg-info-soft" : "hover:bg-hover"
                                )}
                                onClick={() => {
                                  userScrolledRef.current = false;
                                  handleSeek(segment.start);
                                }}
                              >
                                <span className="text-accent shrink-0 font-mono text-xs leading-5">
                                  {formatTimeMs(segment.start)}
                                </span>
                                <span className="text-ink-2 flex-1 text-sm leading-5">
                                  {segment.text}
                                </span>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Highlights tab */}
                {activeTab === "highlights" && (
                  <div className="h-full">
                    {highlights.length === 0 ? (
                      <div className="text-ink-3 flex h-full flex-col items-center justify-center gap-3">
                        <Sparkles size={28} />
                        <span className="text-sm">暂无高亮片段</span>
                        {transcriptSegments.length > 0 && (
                          <button
                            className="bg-accent hover:bg-accent-hover flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
                            disabled={isGeneratingInsights}
                            onClick={() => void handleGenerateInsights(transcriptSegments)}
                          >
                            {isGeneratingInsights ? (
                              <>
                                <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
                                生成中...
                              </>
                            ) : (
                              <>
                                <Zap className="size-4" strokeWidth={1.75} />
                                生成高亮
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {highlights.map(h => (
                          <div
                            key={h.id}
                            className="hover:bg-accent-soft/50 hover:border-accent/40 border-line-1 cursor-pointer rounded-xl border px-3 py-2.5 transition-all"
                            onClick={() => handleSeek(h.start)}
                          >
                            <div className="text-ink-1 text-sm font-medium">{h.title}</div>
                            <div className="text-ink-2 mt-1 line-clamp-2 text-xs leading-relaxed">
                              {h.quote}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Summary tab */}
                {activeTab === "summary" && (
                  <>
                    {!audioNote.summary && !isSummaryStreaming ? (
                      <div className="flex h-full flex-col items-center justify-center gap-4">
                        <div className="text-ink-3 flex flex-col items-center gap-2">
                          <FileText size={28} />
                          <span className="text-sm">暂无总结</span>
                        </div>
                        {transcriptSegments.length > 0 && (
                          <button
                            className="bg-accent hover:bg-accent-hover flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
                            onClick={handleStartSummary}
                            disabled={isSummarizing}
                          >
                            <Zap className="size-4" strokeWidth={1.75} />
                            生成总结
                          </button>
                        )}
                      </div>
                    ) : (
                      <div>
                        {summaryContent && (
                          <Editor ref={summaryEditorRef} initValue={summaryContent} readonly />
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Note tab */}
                {activeTab === "note" && (
                  <div className="h-full">
                    {noteItems.length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center gap-4">
                        <div className="text-ink-3 flex flex-col items-center gap-2">
                          <Pencil size={28} />
                          <span className="text-sm">暂无笔记</span>
                        </div>
                        <button
                          className="bg-accent hover:bg-accent-hover flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
                          onClick={handleCreateNoteItem}
                        >
                          <Pencil size={14} />
                          新建笔记
                        </button>
                      </div>
                    ) : (
                      <div className="h-full">
                        {noteItems.map(item => {
                          const content = noteContentMap[item.contentId];
                          if (!content || item.id !== activeNoteItemId) return null;
                          return (
                            <Editor
                              contentId={item.contentId}
                              key={item.id}
                              ref={editorRef}
                              initValue={content}
                              readonly={false}
                              onChange={value => handleNoteContentChange(item.contentId, value)}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          }
        />
      </div>
      <ConfirmDialog
        open={llmConfirm !== null}
        onOpenChange={next => {
          if (!next) setLlmConfirm(null);
        }}
        title="LLM 优化配置不完整"
        description={llmConfirm ? `${llmConfirm.errorMessage}。是否打开设置页面进行配置？` : ""}
        confirmText="打开设置"
        cancelText="取消转录"
        onConfirm={() => {
          setLlmConfirm(null);
          openLLMSettingsSection();
        }}
      />
    </div>
  );
};

function formatTimeMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default AudioNoteView;
