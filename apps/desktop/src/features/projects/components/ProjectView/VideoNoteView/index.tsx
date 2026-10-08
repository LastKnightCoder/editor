/**
 * 项目条目 · 视频笔记（学习台布局，同 Vibe Learning）：
 * 左 = 材料（视频 + 跟随播放的转录），中 = 本视频的 AI 对话；打开「笔记」后笔记占中间、
 * 对话退到右栏（可拖宽 / 收起）。收起对话的开关常驻顶栏，笔记打开时收起由笔记占满中间、
 * 关闭时材料栏独占。对话面板始终挂在同一位置，切换布局不打断进行中的回答。
 * 会话与工具跟视频走（useScopedChat / 视频专属工具），与壳层全局 AI 栏无关。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalStorageState, useSize } from "ahooks";
import {
  BookText,
  MessageCircle,
  MoreHorizontal,
  NotebookPen,
  RefreshCw,
  Subtitles,
  Video,
  Zap,
} from "lucide-react";
import { ConfirmDialog, IconButton, Loading, Menu, Tooltip, cn, toast } from "@tau/ui";
import { ResizableAndHideableSidebar as ResizeableAndHideableSidebar } from "@tau/ui";
import { StageHeader } from "@/components/StageHeader";
import { DOCK_CHAT_MIN, clampDockChatWidth, useDockResize } from "@/hooks/useDockResize";
import useSettingStore from "@/stores/useSettingStore";
import useUploadResource from "@/hooks/useUploadResource";
import { useLLMConfig } from "@/hooks/useLLMConfig";
import { openLLMSettingsSection } from "@/utils/transcription";
import { getProjectItemById, getVideoNoteById } from "@/commands";
import type { VideoNote } from "@/types";
import VideoNoteChatPanel from "@/components/VideoNotePanel/VideoNoteChatPanel";
import VideoNoteEpubExportModal from "@/components/VideoNotePanel/VideoNoteEpubExportModal";
import { VideoController } from "@/components/VideoNotePanel/VideoController";
import { useVideoNoteSource } from "@/components/VideoNotePanel/useVideoNoteSource";
import { useVideoNoteTranscription } from "@/components/VideoNotePanel/useVideoNoteTranscription";
import {
  TRANSCRIPTION_LANGUAGES,
  VIDEO_NOTE_AUTO_LANGUAGE,
  resolveVideoNoteOptimizationLanguage,
} from "@/components/VideoNotePanel/transcription-language";
import { renderMenuEntries, type MenuEntryList } from "../shared/menuEntries";
import { useProjectContext } from "../ProjectContext";
import { buildWebVtt } from "./subtitle";
import { MaterialColumn } from "./MaterialColumn";
import { NotesStage } from "./NotesStage";

const SOURCE_LABELS: Record<VideoNote["metaInfo"]["type"], string> = {
  local: "本地视频",
  remote: "远程视频",
  bilibili: "哔哩哔哩",
  youtube: "YouTube",
};

/** 笔记打开时，条目宽度低于此值自动收起材料栏（三栏放不下） */
const MATERIAL_AUTO_COLLAPSE_WIDTH = 1080;

interface VideoNoteViewProps {
  videoNoteId: number;
}

const VideoNoteView = ({ videoNoteId }: VideoNoteViewProps) => {
  const mainDbName = useSettingStore(state => state.setting.database.active);
  const { itemId: activeProjectItemId } = useProjectContext();
  const uploadResource = useUploadResource();
  const ebookLLM = useLLMConfig("videoEbookRewrite");

  const rootRef = useRef<HTMLDivElement>(null);
  const rootWidth = useSize(rootRef)?.width ?? 0;

  const [videoNote, setVideoNote] = useState<VideoNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState(VIDEO_NOTE_AUTO_LANGUAGE);
  const [ebookOpen, setEbookOpen] = useState(false);

  const [materialWidth, setMaterialWidth] = useLocalStorageState("video-note-material-width", {
    defaultValue: 380,
  });
  const [notesOpen, setNotesOpen] = useLocalStorageState(`video-note-notes-open-${videoNoteId}`, {
    defaultValue: false,
  });
  const [chatWidth, setChatWidth] = useLocalStorageState("video-note-chat-width", {
    defaultValue: DOCK_CHAT_MIN,
  });
  const [chatOpen, setChatOpen] = useLocalStorageState("video-note-chat-open", {
    defaultValue: true,
  });
  const [subtitleMounted, setSubtitleMounted] = useLocalStorageState<boolean>(
    `video_note_subtitle_mounted_${videoNoteId}`,
    { defaultValue: false }
  );

  const dockWidth = clampDockChatWidth(chatWidth ?? DOCK_CHAT_MIN);
  const startDockResize = useDockResize(dockWidth, setChatWidth);
  const dockChat = !!notesOpen;
  // 笔记关闭且对话收起：材料栏独占整行（专注看视频/转录）
  const materialFills = !dockChat && !chatOpen;
  // 材料栏常驻；仅笔记打开且条目过窄（三栏放不下）时让位，关掉笔记即恢复
  const materialVisible = !(dockChat && rootWidth > 0 && rootWidth < MATERIAL_AUTO_COLLAPSE_WIDTH);

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
    else if (key === "subtitle") setSubtitleMounted(!subtitleMounted);
    else if (key === "ebook") setEbookOpen(true);
  };

  const toggleClass = (on: boolean) =>
    cn(on && "bg-selected text-accent-text enabled:hover:bg-selected");

  const meta = [
    SOURCE_LABELS[videoNote.metaInfo.type],
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
            <Tooltip content={notesOpen ? "收起笔记" : "打开笔记"} placement="bottom">
              <IconButton
                aria-label={notesOpen ? "收起笔记" : "打开笔记"}
                aria-pressed={!!notesOpen}
                onClick={() => setNotesOpen(!notesOpen)}
                className={toggleClass(!!notesOpen)}
              >
                <NotebookPen className="size-4" strokeWidth={1.75} />
              </IconButton>
            </Tooltip>
            <Tooltip content={chatOpen ? "收起对话" : "展开对话"} placement="bottom">
              <IconButton
                aria-label={chatOpen ? "收起对话" : "展开对话"}
                aria-pressed={!!chatOpen}
                onClick={() => setChatOpen(!chatOpen)}
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

      <div className="flex min-h-0 flex-1">
        <ResizeableAndHideableSidebar
          width={materialWidth ?? 380}
          onWidthChange={setMaterialWidth}
          open={materialVisible}
          sidebarPosition="left"
          minWidth={280}
          maxWidth={560}
          disableResize={!materialVisible || materialFills}
          showDivider
          fillRemaining={materialFills}
          className="h-full"
        >
          <MaterialColumn
            videoNote={videoNote}
            source={source}
            transcription={transcription}
            subtitleTrackUrl={subtitleTrackUrl}
            subtitleLanguage={resolveVideoNoteOptimizationLanguage(language, null)}
            onVideoElement={handleVideoElement}
          />
        </ResizeableAndHideableSidebar>

        {dockChat && (
          <div className="min-w-0 flex-1">
            <NotesStage videoNoteId={videoNoteId} videoController={videoController} />
          </div>
        )}

        {/* 对话：笔记关闭时占中间，打开时停靠右栏；收起只隐藏（保留流式回答），入口常驻顶栏 */}
        <div
          className={cn(
            "relative flex min-h-0 min-w-0 flex-col",
            dockChat ? "shrink-0 shadow-[inset_1px_0_0_var(--tau-line-2)]" : "flex-1",
            !chatOpen && "hidden"
          )}
          style={dockChat ? { width: dockWidth } : undefined}
        >
          {dockChat && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="调整对话栏宽度"
              onPointerDown={startDockResize}
              className="hover:bg-accent/30 absolute inset-y-0 -left-[3px] z-10 w-[6px] cursor-col-resize transition-colors"
            />
          )}
          <VideoNoteChatPanel
            videoNoteId={videoNoteId}
            mainDbName={mainDbName}
            transcript={transcriptText}
            docked={dockChat}
          />
        </div>
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
