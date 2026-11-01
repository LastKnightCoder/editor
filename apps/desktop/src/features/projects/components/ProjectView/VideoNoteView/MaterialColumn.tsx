/**
 * 视频笔记 · 左栏：播放器（章节分段 + 笔记刻度）+ 跟随播放的转录（章节作段头，点句跳播）。
 * 转录里划选弹工具条：摘到笔记 / 问 AI / 从这句播放 / 复制；已摘录的句子留浅色底。
 * 未转录时转录区即空状态入口（自动识别语言；指定语言走条目 ⋯ 菜单）；
 * 转录 / AI 断句进行中就地显示进度与流式结果。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Captions, Copy, LocateFixed, NotebookPen, Play, Sparkles } from "lucide-react";
import { Button, Spinner, cn, toast } from "@tau/ui";
import { VideoPlayer, type VideoChapter, type VideoMarker } from "@tau/shared";
import LocalVideo from "@/components/LocalVideo";
import { FadeScroll } from "@tau/ui";
import TranscriptPanel, {
  type TranscriptChapter,
} from "@/components/MediaTranscript/TranscriptPanel";
import { formatTime, useTranscriptSync } from "@/components/MediaTranscript/useTranscriptSync";
import type { useVideoNoteSource } from "@/components/VideoNotePanel/useVideoNoteSource";
import type { useVideoNoteTranscription } from "@/components/VideoNotePanel/useVideoNoteTranscription";
import type { TranscriptSegment, VideoNote } from "@/types";

interface MaterialColumnProps {
  videoNote: VideoNote;
  source: ReturnType<typeof useVideoNoteSource>;
  transcription: ReturnType<typeof useVideoNoteTranscription>;
  subtitleTrackUrl: string;
  subtitleLanguage: string;
  /** 章节（毫秒起点）：进度条分段、转录分组 */
  chapters: TranscriptChapter[];
  chaptersGenerating: boolean;
  markers: VideoMarker[];
  quotedIndexes: ReadonlySet<number>;
  /** 视频元素挂载 / 卸载（笔记的时间戳、截帧扩展经它控制播放） */
  onVideoElement: (element: HTMLVideoElement | null) => void;
  onQuote: (text: string, segment: TranscriptSegment) => void;
  onAsk: (text: string, segment: TranscriptSegment) => void;
}

interface TranscriptSelection {
  text: string;
  segment: TranscriptSegment;
  /** 工具条位置：相对转录区 */
  left: number;
  top: number;
}

const ICON = { size: 15, strokeWidth: 1.75 } as const;

export function MaterialColumn({
  videoNote,
  source,
  transcription,
  subtitleTrackUrl,
  subtitleLanguage,
  chapters,
  chaptersGenerating,
  markers,
  quotedIndexes,
  onVideoElement,
  onQuote,
  onAsk,
}: MaterialColumnProps) {
  const segments = videoNote.transcriptSegments;
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const {
    currentSegmentIndex,
    currentOutOfView,
    jumpToCurrent,
    transcriptContainerRef,
    segmentRefsMap,
    handleSegmentClick,
    setMediaRef,
  } = useTranscriptSync({ segments, mediaRef });

  const setVideoRef = useCallback(
    (element: HTMLVideoElement | null) => {
      setMediaRef(element);
      onVideoElement(element);
    },
    [setMediaRef, onVideoElement]
  );

  // 播放器用秒，转录 / 章节用毫秒
  const playerChapters = useMemo<VideoChapter[]>(
    () => chapters.map(c => ({ start: c.start / 1000, title: c.title })),
    [chapters]
  );

  // ---- 划选工具条：只认转录区内的选区，滚动时跟着重新定位 ----
  const wrapRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<TranscriptSelection | null>(null);
  const selectionOpenRef = useRef(false);
  selectionOpenRef.current = !!selection;
  const readSelection = useCallback(() => {
    const wrap = wrapRef.current;
    const native = window.getSelection();
    const text = native?.toString().trim();
    if (!wrap || !native || native.isCollapsed || !text || !native.rangeCount) {
      setSelection(null);
      return;
    }
    const range = native.getRangeAt(0);
    if (!wrap.contains(range.commonAncestorContainer)) {
      setSelection(null);
      return;
    }
    const first = Array.from(wrap.querySelectorAll("[data-segment-index]")).find(el =>
      range.intersectsNode(el)
    );
    const segment = segments?.[Number(first?.getAttribute("data-segment-index"))];
    const rect = range.getBoundingClientRect();
    const box = wrap.getBoundingClientRect();
    if (!segment || rect.bottom < box.top || rect.top > box.bottom) {
      setSelection(null);
      return;
    }
    const above = rect.top - box.top - 44;
    setSelection({
      text,
      segment,
      left: rect.left - box.left,
      top: above >= 4 ? above : rect.bottom - box.top + 6,
    });
  }, [segments]);

  useEffect(() => {
    const onChange = () => {
      if (window.getSelection()?.isCollapsed) setSelection(null);
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  const hasSegments = !!segments?.length;
  useEffect(() => {
    const container = transcriptContainerRef.current;
    if (!container || !hasSegments) return;
    const onScroll = () => {
      if (selectionOpenRef.current) readSelection();
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [hasSegments, readSelection, transcriptContainerRef]);

  const finishSelection = () => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  const track = subtitleTrackUrl ? (
    <track
      key={subtitleTrackUrl}
      kind="subtitles"
      src={subtitleTrackUrl}
      srcLang={subtitleLanguage}
      label="转录字幕"
      default
    />
  ) : null;

  const { isTranscribing, progress, isOptimizing, streamingSegments } = transcription;

  return (
    // pb-4：转录视口与纸面下缘留出间距（同文档 / 网页条目正文），列表在视口边缘渐隐而非贴边硬切
    <div className="flex h-full min-h-0 flex-col pb-4">
      {/* 视频：就绪前用主题化底色的 16:9 框承载下载 / 错误态，就绪后换成播放器卡片 */}
      <div className="shrink-0 pr-3 pb-2 pl-4">
        {source.ready ? (
          source.useLocalVideo ? (
            <LocalVideo
              ref={setVideoRef}
              src={source.src!}
              crossOrigin="anonymous"
              className="w-full"
              chapters={playerChapters}
              markers={markers}
            >
              {track}
            </LocalVideo>
          ) : (
            <VideoPlayer
              ref={setVideoRef}
              src={source.src!}
              crossOrigin="anonymous"
              className="w-full"
              chapters={playerChapters}
              markers={markers}
            >
              {track}
            </VideoPlayer>
          )
        ) : (
          <div className="rounded-tau-md bg-sunken relative aspect-video w-full overflow-hidden">
            {source.loader}
          </div>
        )}
      </div>

      <div className="text-tau-sm text-ink-3 flex h-9 shrink-0 items-center gap-1.5 px-6">
        <span className="text-tau-body text-ink-1 font-semibold">转录</span>
        {hasSegments && !isTranscribing && (
          <span>
            · {segments!.length} 段
            {chaptersGenerating
              ? " · 正在分章节…"
              : chapters.length
                ? ` · ${chapters.length} 章`
                : ""}
          </span>
        )}
        {isTranscribing && (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Spinner className="size-3" />
            <span className="truncate">{progress}</span>
          </span>
        )}
        <span className="flex-1" />
        {isOptimizing && (
          <button
            type="button"
            onClick={transcription.cancelOptimization}
            className="text-ink-2 hover:text-ink-1 cursor-pointer"
          >
            取消优化
          </button>
        )}
      </div>

      {isOptimizing && streamingSegments.length > 0 ? (
        <FadeScroll className="tau-sheet-scroll min-h-0 flex-1 [--edge-fade-bottom-size:24px] [--edge-fade-top-size:24px]">
          <div className="flex flex-col gap-px px-3 pt-1 pb-6">
            {streamingSegments.map((segment, index) => (
              <div
                key={index}
                className="grid grid-cols-[56px_1fr] gap-3 rounded-[8px] px-3 py-1.5"
              >
                <span className="text-tau-sm text-ink-3 pt-px font-mono tabular-nums">
                  {formatTime(segment.start)}
                </span>
                <span className="text-tau-body text-ink-2 leading-relaxed break-words">
                  {segment.text}
                </span>
              </div>
            ))}
          </div>
        </FadeScroll>
      ) : hasSegments ? (
        <div
          ref={wrapRef}
          className="relative flex min-h-0 flex-1 flex-col"
          onMouseUp={() => requestAnimationFrame(readSelection)}
        >
          <TranscriptPanel
            segments={segments}
            currentSegmentIndex={currentSegmentIndex}
            containerRef={transcriptContainerRef}
            segmentRefsMap={segmentRefsMap}
            onSegmentClick={handleSegmentClick}
            chapters={chapters}
            quotedIndexes={quotedIndexes}
            innerClassName="px-3 pb-6 pt-1"
            className="tau-sheet-scroll [--edge-fade-bottom-size:24px] [--edge-fade-top-size:24px]"
          />
          {selection && (
            <div
              role="toolbar"
              aria-label="转录选区"
              className="bg-surface shadow-float rounded-tau-md absolute z-20 flex h-9 items-center gap-0.5 px-1.5"
              style={{
                left: `clamp(8px, ${selection.left}px, calc(100% - 300px))`,
                top: selection.top,
              }}
              onMouseDown={event => event.preventDefault()}
            >
              <SelectionButton
                accent
                label="摘到笔记"
                icon={<NotebookPen {...ICON} />}
                onClick={() => {
                  onQuote(selection.text, selection.segment);
                  finishSelection();
                }}
              >
                摘到笔记
              </SelectionButton>
              <SelectionButton
                label="问 AI"
                icon={<Sparkles {...ICON} />}
                onClick={() => {
                  onAsk(selection.text, selection.segment);
                  finishSelection();
                }}
              >
                问 AI
              </SelectionButton>
              <span aria-hidden className="bg-line-1 mx-1 h-4 w-px shrink-0" />
              <SelectionButton
                label="从这句播放"
                icon={<Play {...ICON} />}
                onClick={() => {
                  handleSegmentClick(selection.segment);
                  finishSelection();
                }}
              />
              <SelectionButton
                label="复制"
                icon={<Copy {...ICON} />}
                onClick={() => {
                  void navigator.clipboard
                    .writeText(selection.text)
                    .then(() => toast.success("已复制"));
                  finishSelection();
                }}
              />
            </div>
          )}
          {currentOutOfView && (
            <button
              type="button"
              onClick={jumpToCurrent}
              className="bg-surface shadow-lift text-tau-sm text-ink-1 absolute right-4 bottom-3 z-10 flex h-[30px] cursor-pointer items-center gap-1.5 rounded-full px-3"
            >
              <LocateFixed className="text-accent-text size-3.5" strokeWidth={1.75} />
              回到当前播放
            </button>
          )}
        </div>
      ) : isTranscribing ? (
        <div className="text-tau-meta text-ink-3 flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
          <span>转录完成后，字幕会出现在这里</span>
          <span className="text-tau-sm">可以先开始记笔记，时间戳和截帧不依赖转录</span>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 pb-10 text-center">
          <Captions className="text-ink-3 size-6" strokeWidth={1.5} />
          <p className="text-tau-meta text-ink-2">
            还没有转录。转录后能跟着字幕读、划句子摘到笔记，
            <br />
            也能让 AI 基于视频内容回答
          </p>
          <Button size="sm" variant="primary" onClick={() => void transcription.transcribe()}>
            开始转录
          </Button>
          <p className="text-tau-sm text-ink-3">自动识别语言，需要指定语言可在右上角 ⋯ 中选择</p>
        </div>
      )}
    </div>
  );
}

function SelectionButton({
  label,
  icon,
  children,
  onClick,
  accent,
}: {
  label: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={children ? undefined : label}
      onClick={onClick}
      className={cn(
        "rounded-tau-sm text-tau-sm ease-tau-out flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap transition-[background,color] duration-[160ms]",
        children ? "px-2" : "w-7 justify-center",
        accent
          ? "text-accent-text hover:bg-accent-soft"
          : "text-ink-2 hover:bg-hover hover:text-ink-1"
      )}
    >
      {icon}
      {children}
    </button>
  );
}
