/**
 * 项目条目 · 视频笔记（剧场版面）：左栏看（播放器 + 跟随转录），右栏记（笔记常驻）。
 * 对话默认收起、Ctrl/⌘+J 开合（接管壳层停靠栏开关）：条目区放得下三栏时停成第三栏，
 * 否则作为抽屉盖在笔记栏上——画面任何宽度都不让位。条目区放不下两栏时临时收起项目文档树。
 * 对话面板首次打开才挂载，之后只隐藏，切换停靠 / 抽屉不打断进行中的回答。
 * 会话与工具跟视频走（useScopedChat / 视频专属工具），与壳层全局 AI 栏无关。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalStorageState, useSize } from "ahooks";
import {
  BookText,
  ListTree,
  MessageCircle,
  MoreHorizontal,
  RefreshCw,
  Subtitles,
  Video,
  Zap,
} from "lucide-react";
import { ConfirmDialog, IconButton, Loading, Menu, Tooltip, cn, toast } from "@tau/ui";
import { ResizableAndHideableSidebar as ResizeableAndHideableSidebar } from "@tau/ui";
import type { VideoMarker } from "@tau/shared";
import { StageHeader } from "@/components/StageHeader";
import { DOCK_CHAT_MIN, clampDockChatWidth, useDockResize } from "@/hooks/useDockResize";
import useSettingStore from "@/stores/useSettingStore";
import useUploadResource from "@/hooks/useUploadResource";
import { useLLMConfig } from "@/hooks/useLLMConfig";
import { openLLMSettingsSection } from "@/utils/transcription";
import { getProjectItemById, getVideoNoteById } from "@/commands";
import type { TranscriptSegment, VideoNote } from "@/types";
import { useVideoProviderName } from "@/hooks/useVideoProviders";
import { useOwnAssist } from "@/app/assistOwner";
import { useOverlayDismiss } from "@/page/PageProvider";
import { useProjectTreeStore } from "@/features/projects/projectTreeStore";
import VideoNoteChatPanel, {
  type TranscriptQuote,
  type VideoNoteChatPanelHandle,
} from "@/components/VideoNotePanel/VideoNoteChatPanel";
import VideoNoteEpubExportModal from "@/components/VideoNotePanel/VideoNoteEpubExportModal";
import { VideoController } from "@/components/VideoNotePanel/VideoController";
import { useVideoNoteSource } from "@/components/VideoNotePanel/useVideoNoteSource";
import { useVideoNoteTranscription } from "@/components/VideoNotePanel/useVideoNoteTranscription";
import { useVideoNoteChapters } from "@/components/VideoNotePanel/useVideoNoteChapters";
import {
  TRANSCRIPTION_LANGUAGES,
  VIDEO_NOTE_AUTO_LANGUAGE,
  resolveVideoNoteOptimizationLanguage,
} from "@/components/VideoNotePanel/transcription-language";
import { renderMenuEntries, type MenuEntryList } from "../shared/menuEntries";
import { useProjectContext } from "../ProjectContext";
import { buildWebVtt } from "./subtitle";
import { MaterialColumn } from "./MaterialColumn";
import { NotesStage, type NotesStageHandle } from "./NotesStage";
import { quotedSegmentIndexes, type NoteMarker } from "./noteMarkers";

const SOURCE_LABELS: Record<string, string> = {
  local: "本地视频",
  remote: "远程视频",
};

/** 左栏（看）与右栏（记）的最小宽度 */
const WATCH_MIN = 440;
const NOTES_MIN = 360;
/** 条目区低于此值（两栏放不下）时临时收起项目文档树 */
const TWO_COLUMNS_MIN = WATCH_MIN + NOTES_MIN + 60;
/** 项目文档树宽度（ProjectList 持久化的键），用于判断收起后是否放得下 */
const readTreeWidth = () => {
  try {
    return Number(JSON.parse(localStorage.getItem("project-list-sidebar-width") ?? "300")) || 300;
  } catch {
    return 300;
  }
};

const MARKER_LABEL: Record<NoteMarker["kind"], string> = {
  timestamp: "时间戳",
  quote: "摘录",
  screenshot: "截帧",
};

interface VideoNoteViewProps {
  videoNoteId: number;
}

const VideoNoteView = ({ videoNoteId }: VideoNoteViewProps) => {
  const mainDbName = useSettingStore(state => state.setting.database.active);
  const { itemId: activeProjectItemId, containerWidth } = useProjectContext();
  const uploadResource = useUploadResource();
  const ebookLLM = useLLMConfig("videoEbookRewrite");

  const rootRef = useRef<HTMLDivElement>(null);
  const rootWidth = useSize(rootRef)?.width ?? 0;

  const [videoNote, setVideoNote] = useState<VideoNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState(VIDEO_NOTE_AUTO_LANGUAGE);
  const [ebookOpen, setEbookOpen] = useState(false);
  const providerName = useVideoProviderName(videoNote?.metaInfo.type);

  const [watchWidth, setWatchWidth] = useLocalStorageState<number | undefined>(
    "video-note-watch-width"
  );
  const [chatWidth, setChatWidth] = useLocalStorageState("video-note-chat-width", {
    defaultValue: DOCK_CHAT_MIN,
  });
  const [chatOpen, setChatOpen] = useLocalStorageState("video-note-chat-open", {
    defaultValue: false,
  });
  // 首次打开才挂载，之后收起只隐藏（保留进行中的回答）
  const [chatMounted, setChatMounted] = useState(!!chatOpen);
  if (chatOpen && !chatMounted) setChatMounted(true);
  const [subtitleMounted, setSubtitleMounted] = useLocalStorageState<boolean>(
    `video_note_subtitle_mounted_${videoNoteId}`,
    { defaultValue: false }
  );

  // 宽度裁决：左栏默认占约 56%，任何时候都给笔记留出 NOTES_MIN；放得下三栏才停靠对话
  const dockWidth = clampDockChatWidth(chatWidth ?? DOCK_CHAT_MIN);
  const startDockResize = useDockResize(dockWidth, setChatWidth);
  const chatDocked = !!chatOpen && rootWidth >= WATCH_MIN + NOTES_MIN + dockWidth;
  const columnsWidth = rootWidth - (chatDocked ? dockWidth : 0);
  const watchMax = Math.max(WATCH_MIN, columnsWidth - NOTES_MIN);
  const watchActual = Math.min(
    watchMax,
    Math.max(WATCH_MIN, watchWidth ?? Math.round(columnsWidth * 0.56))
  );
  const chatOverlay = !!chatOpen && !chatDocked;
  useOverlayDismiss(() => setChatOpen(false), chatOverlay);

  const toggleChat = useCallback(() => setChatOpen(open => !open), [setChatOpen]);
  useOwnAssist("project-detail", toggleChat);

  // 条目区放不下两栏：临时收起项目文档树（按「收起后能否放下」判断，避免来回切换）
  const setTreeAutoCollapse = useProjectTreeStore(s => s.setAutoCollapse);
  useEffect(() => {
    if (!containerWidth) return;
    setTreeAutoCollapse(containerWidth - readTreeWidth() < TWO_COLUMNS_MIN);
  }, [containerWidth, setTreeAutoCollapse]);
  useEffect(() => () => setTreeAutoCollapse(false), [setTreeAutoCollapse]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getVideoNoteById(videoNoteId)
      .then(note => {
        if (cancelled) return;
        if (!note) toast.error("视频笔记不存在");
        setVideoNote(note ?? null);
      })
      .catch(error => {
        console.error("Failed to load video note:", error);
        toast.error("加载失败");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [videoNoteId]);

  useEffect(() => {
    if (!activeProjectItemId) {
      setTitle("");
      return;
    }
    getProjectItemById(activeProjectItemId)
      .then(item => setTitle(item?.title || ""))
      .catch(() => setTitle(""));
  }, [activeProjectItemId]);

  const source = useVideoNoteSource(videoNote?.metaInfo);
  const transcription = useVideoNoteTranscription({
    videoNote,
    language,
    onTranscriptSaved: patch => setVideoNote(prev => (prev ? { ...prev, ...patch } : prev)),
  });

  // 视频元素：笔记的时间戳 / 截帧扩展经 VideoController 读写播放状态
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const handleVideoElement = useCallback((element: HTMLVideoElement | null) => {
    videoElementRef.current = element;
  }, []);
  const videoController = useMemo(
    () =>
      new VideoController(
        () => videoElementRef.current,
        async (file: File) => (await uploadResource(file)) || null
      ),
    [uploadResource]
  );

  // 挂载字幕：转录生成 WebVTT，挂为 <track>
  const subtitleVtt = useMemo(() => {
    const segments = videoNote?.transcriptSegments;
    return segments?.length ? buildWebVtt(segments, { minDurationMs: 500 }) : "";
  }, [videoNote?.transcriptSegments]);
  const [subtitleTrackUrl, setSubtitleTrackUrl] = useState("");
  useEffect(() => {
    if (!subtitleMounted || !subtitleVtt) {
      setSubtitleTrackUrl("");
      return;
    }
    const url = URL.createObjectURL(new Blob([subtitleVtt], { type: "text/vtt" }));
    setSubtitleTrackUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [subtitleMounted, subtitleVtt]);

  const transcriptText = useMemo(() => {
    if (!videoNote) return "";
    if (videoNote.transcript?.trim()) return videoNote.transcript;
    return videoNote.transcriptSegments?.map(item => item.text).join(" ") ?? "";
  }, [videoNote]);

  const chapterState = useVideoNoteChapters({
    videoNote,
    busy: transcription.isTranscribing,
    onSaved: insights => setVideoNote(prev => (prev ? { ...prev, insights } : prev)),
  });
  const chapters = chapterState.chapters;

  // 笔记里的时间点 → 进度条刻度 + 转录「已摘录」
  const [noteMarkers, setNoteMarkers] = useState<NoteMarker[]>([]);
  const playerMarkers = useMemo<VideoMarker[]>(
    () =>
      noteMarkers.map(marker => ({
        id: marker.id,
        time: marker.time,
        kind: marker.kind,
        content: (
          <>
            {marker.text || MARKER_LABEL[marker.kind]}
            <span className="text-ink-3 text-tau-micro mt-0.5 block">
              {MARKER_LABEL[marker.kind]} · {marker.noteTitle}
            </span>
          </>
        ),
      })),
    [noteMarkers]
  );
  const quotedIndexes = useMemo(
    () => quotedSegmentIndexes(noteMarkers, videoNote?.transcriptSegments),
    [noteMarkers, videoNote?.transcriptSegments]
  );

  const notesRef = useRef<NotesStageHandle>(null);
  const handleQuote = useCallback((text: string, segment: TranscriptSegment) => {
    notesRef.current?.insertQuote(text, segment.start / 1000);
  }, []);

  // 问 AI：展开对话并带上原句；对话尚未挂载时等挂载后补上
  const chatRef = useRef<VideoNoteChatPanelHandle | null>(null);
  const pendingQuote = useRef<TranscriptQuote | null>(null);
  const handleAsk = useCallback(
    (text: string, segment: TranscriptSegment) => {
      const quote = { text, time: segment.start / 1000 };
      setChatOpen(true);
      if (chatRef.current) chatRef.current.attachQuote(quote);
      else pendingQuote.current = quote;
    },
    [setChatOpen]
  );
  const onChatRef = useCallback((handle: VideoNoteChatPanelHandle | null) => {
    chatRef.current = handle;
    if (handle && pendingQuote.current) {
      handle.attachQuote(pendingQuote.current);
      pendingQuote.current = null;
    }
  }, []);

  if (loading) return <Loading minHeight={0} />;

  if (!videoNote) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-8 text-center">
        <Video className="text-ink-3 size-6" strokeWidth={1.5} />
        <p className="text-tau-body text-ink-1 font-medium">视频笔记不存在</p>
        <p className="text-tau-meta text-ink-3">该笔记可能已被删除或加载异常</p>
      </div>
    );
  }

  const hasSegments = !!videoNote.transcriptSegments?.length;
  const displayTitle = title || videoNote.description || "未命名视频";

  const moreMenuItems: MenuEntryList = [];
  moreMenuItems.push({
    key: "retranscribe",
    label: hasSegments ? "重新转录" : "指定语言转录",
    icon: <RefreshCw className="size-4" strokeWidth={1.75} />,
    // 子菜单不支持 disabled：转录进行中退化为禁用的普通项
    disabled: transcription.isTranscribing,
    children: transcription.isTranscribing
      ? undefined
      : TRANSCRIPTION_LANGUAGES.map(option => ({
          key: `retranscribe:${option.value}`,
          label: option.label,
        })),
  });
  if (transcription.canOptimize) {
    moreMenuItems.push({
      key: "optimize",
      label: "AI 优化断句",
      icon: <Zap className="size-4" strokeWidth={1.75} />,
      disabled: transcription.isTranscribing,
    });
  }
  if (chapterState.canRegenerate) {
    moreMenuItems.push({
      key: "chapters",
      label: chapterState.generating ? "正在生成章节…" : "重新生成章节",
      icon: <ListTree className="size-4" strokeWidth={1.75} />,
      disabled: chapterState.generating || transcription.isTranscribing,
    });
  }
  if (hasSegments) {
    moreMenuItems.push({
      key: "subtitle",
      label: subtitleMounted ? "取消挂载字幕" : "挂载字幕",
      icon: <Subtitles className="size-4" strokeWidth={1.75} />,
    });
  }
  if (moreMenuItems.length) moreMenuItems.push({ key: "divider", label: "", divider: true });
  moreMenuItems.push({
    key: "ebook",
    label: "AI 导出电子书",
    icon: <BookText className="size-4" strokeWidth={1.75} />,
    disabled: !transcriptText,
  });

  const handleMoreMenu = (key: string) => {
    if (key.startsWith("retranscribe:")) {
      // 语言状态下次渲染才生效：本次转录直接用所选语言
      const next = key.slice("retranscribe:".length);
      setLanguage(next);
      void transcription.transcribe(next);
    } else if (key === "optimize") transcription.optimize();
    else if (key === "chapters") chapterState.regenerate();
    else if (key === "subtitle") setSubtitleMounted(!subtitleMounted);
    else if (key === "ebook") setEbookOpen(true);
  };

  const toggleClass = (on: boolean) =>
    cn(on && "bg-selected text-accent-text enabled:hover:bg-selected");

  const meta = [
    SOURCE_LABELS[videoNote.metaInfo.type] ?? providerName,
    transcription.isTranscribing ? "转录中…" : hasSegments ? "已转录" : "未转录",
  ].join(" · ");

  return (
    <div ref={rootRef} className="flex h-full min-h-0 w-full flex-col">
      <StageHeader
        icon={<Video className="size-4" strokeWidth={1.75} />}
        title={<span title={displayTitle}>{displayTitle}</span>}
        meta={meta}
        actions={
          <>
            <Tooltip
              content={chatOpen ? "收起对话 (Ctrl/⌘ J)" : "展开对话 (Ctrl/⌘ J)"}
              placement="bottom"
            >
              <IconButton
                aria-label={chatOpen ? "收起对话" : "展开对话"}
                aria-pressed={!!chatOpen}
                onClick={toggleChat}
                className={toggleClass(!!chatOpen)}
              >
                <MessageCircle className="size-4" strokeWidth={1.75} />
              </IconButton>
            </Tooltip>
            {/* trigger 用原生 button + title：Menu.trigger 需单一透传元素，Tooltip 包裹会吞注入 */}
            <Menu
              align="end"
              trigger={
                <button
                  type="button"
                  title="更多操作"
                  aria-label="更多操作"
                  className="text-ink-2 hover:bg-hover hover:text-ink-1 rounded-tau-sm grid size-[30px] cursor-pointer place-items-center transition-colors"
                >
                  <MoreHorizontal className="size-4" strokeWidth={1.75} />
                </button>
              }
            >
              {renderMenuEntries(moreMenuItems, handleMoreMenu)}
            </Menu>
          </>
        }
      />

      <div className="relative flex min-h-0 flex-1">
        <ResizeableAndHideableSidebar
          width={watchActual}
          onWidthChange={width => setWatchWidth(width)}
          open
          sidebarPosition="left"
          minWidth={WATCH_MIN}
          maxWidth={watchMax}
          showDivider
          className="h-full"
        >
          <MaterialColumn
            videoNote={videoNote}
            source={source}
            transcription={transcription}
            subtitleTrackUrl={subtitleTrackUrl}
            subtitleLanguage={resolveVideoNoteOptimizationLanguage(language, null)}
            chapters={chapters}
            chaptersGenerating={chapterState.generating}
            markers={playerMarkers}
            quotedIndexes={quotedIndexes}
            onVideoElement={handleVideoElement}
            onQuote={handleQuote}
            onAsk={handleAsk}
          />
        </ResizeableAndHideableSidebar>

        <div className="min-w-0 flex-1">
          <NotesStage
            ref={notesRef}
            videoNoteId={videoNoteId}
            videoController={videoController}
            onMarkersChange={setNoteMarkers}
          />
        </div>

        {/* 对话：放得下三栏时停靠右栏，否则作为抽屉盖在笔记栏上；同一位置挂载，切换不打断回答 */}
        {chatMounted && (
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-col",
              chatDocked
                ? "relative shrink-0 shadow-[inset_1px_0_0_var(--tau-line-2)]"
                : "bg-surface shadow-float absolute inset-y-0 right-0 z-20",
              !chatOpen && "hidden"
            )}
            style={chatDocked ? { width: dockWidth } : { left: watchActual }}
          >
            {chatDocked && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="调整对话栏宽度"
                onPointerDown={startDockResize}
                className="hover:bg-accent/30 absolute inset-y-0 -left-[3px] z-10 w-[6px] cursor-col-resize transition-colors"
              />
            )}
            <VideoNoteChatPanel
              ref={onChatRef}
              videoNoteId={videoNoteId}
              mainDbName={mainDbName}
              transcript={transcriptText}
              docked
              onClose={() => setChatOpen(false)}
            />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={transcription.llmConfirm != null}
        onOpenChange={open => !open && transcription.dismissLlmConfirm()}
        title={transcription.llmConfirm?.title ?? ""}
        description={transcription.llmConfirm?.description ?? ""}
        confirmText="打开设置"
        onConfirm={() => {
          transcription.dismissLlmConfirm();
          openLLMSettingsSection();
        }}
      />
      <VideoNoteEpubExportModal
        open={ebookOpen}
        onClose={() => setEbookOpen(false)}
        videoNoteId={videoNoteId}
        transcript={transcriptText}
        videoTitle={displayTitle}
        videoDescription={videoNote.description || ""}
        provider={ebookLLM.provider}
        model={ebookLLM.model}
        onOpenLLMSettings={openLLMSettingsSection}
      />
    </div>
  );
};

export default VideoNoteView;
