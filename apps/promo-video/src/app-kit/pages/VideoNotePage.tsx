/**
 * 项目条目 · 视频笔记（剧场版面）重建：结构摘自 features/projects/.../VideoNoteView（index / MaterialColumn / NotesStage）、
 * components/StageHeader 与 VideoNotePanel 的扩展（时间戳芯片、截帧块）。左栏看（播放器 + 字幕），右栏记，对话够宽时停靠成第三栏。
 * 视频里不需要交互：播放位置、字幕滚动、划选、笔记内容、对话进度、菜单开合都由调用方按帧给。
 */
import type { ComponentProps } from "react";
import clsx from "clsx";
import { BookText, Camera, Captions, Clock3, ListTree, MessageCircle, MoreHorizontal, Plus, RefreshCw, Subtitles, Video, Zap } from "lucide-react";
import { Button, IconButton } from "@tau/ui";
import { ChatColumn, VideoNoteChat } from "../parts/VideoNoteChat";
import { Pressed } from "../parts/Dialog";
import { SpinnerLook } from "../parts/FormLook";
import { MenuItem, MenuSeparator, MenuSurface } from "../parts/Menu";
import { QuoteFrame } from "../doc/LiveDoc";
import { CacheLoader, VideoPlayerCard, type MarkerKind } from "../parts/VideoPlayerCard";
import { LectureFrame } from "../parts/LectureSlide";
import { BackToCurrent, TranscriptList, transcriptTime, type TranscriptSelection } from "../parts/TranscriptList";
import type { Segment, SlideKind } from "../../mock/videonote";

export type NotePart = { kind: "text"; text: string } | { kind: "timestamp"; time: number; appear: number };
export type NoteBlock =
  | { kind: "paragraph" | "quote"; parts: NotePart[]; /** 已打出的字数（时间戳芯片算一个） */ typed: number; appear?: number; caret?: boolean }
  | { kind: "screenshot"; time: number; slide: SlideKind; appear: number };

export type VideoNoteState = {
  title: string;
  /** 标题行里的「来源 · 转录状态」 */
  source: string;
  transcript: "已转录" | "转录中…" | "未转录";
  /** 视频时长与播放位置（秒） */
  duration: number;
  time: number;
  playing: boolean;
  slide: SlideKind;
  /** 这一页幻灯片已播了几秒 */
  slideElapsed?: number;
  /** 挂载字幕时叠在画面上的当前这一句 */
  subtitle?: string;
  subtitleMounted?: number;
  /** 章节：起点为毫秒（与字幕同一口径） */
  chapters: { start: number; title: string }[];
  segments: Segment[];
  /** 全片字幕的段数与章数 */
  count: { segments: number; chapters: number };
  /** 当前句的下标 */
  current: number | null;
  /** 字幕容器滚过的像素 */
  scroll?: number;
  quoted?: number[];
  selection?: TranscriptSelection;
  /** 给哪几句放划选锚点（只有会被划选的句子需要） */
  selectHits?: number[];
  backToCurrent?: number;
  markers?: { time: number; kind: MarkerKind; appear: number; text?: string; note: string }[];
  markerHover?: { index: number; appear: number };
  /** 截帧时画面白闪 */
  flash?: number;
  /** 还在缓存到本机：进度 0→1 */
  cache?: { progress: number; done?: number };
  /** 转录刚完成时字幕逐句淡入 0→1 */
  segmentsReveal?: number;
  /** 章节段头刚分好时撑开淡入 0→1 */
  chaptersReveal?: number;
  /** 转录完成后正在生成 AI 章节 */
  chaptering?: boolean;
  /** 转录进行中的进度文案；有值时字幕区显示转录占位 */
  transcribing?: string;
  /** 各按钮的按下态 */
  pressed?: "chat" | "insert-time" | "capture" | "transcribe";
  /** 标题栏 ⋯ 菜单；mounted 为真时「挂载字幕」显示成「取消挂载字幕」 */
  menu?: { appear: number; highlighted?: string; pressed?: string; mounted?: boolean };
  /** 笔记区滚过的像素（笔记写长了以后往下滚，露出新落下的块） */
  noteScroll?: number;
  /** 笔记栏：还没有笔记时是空态；appear 是空态退场的进度 */
  notes: { kind: "empty"; appear?: number } | { kind: "blocks"; blocks: NoteBlock[]; tab: string; appear?: number };
  /** 对话栏展开 0→1；chat 是对话里的内容 */
  chatOpen?: number;
  chat?: ComponentProps<typeof VideoNoteChat>;
};

/** 笔记里的时间：MM:SS（时间戳芯片与截帧说明都用它） */
export const noteTime = (seconds: number) => transcriptTime(seconds * 1000);

function NoteBlockView({ block, index }: { block: NoteBlock; index: number }) {
  if (block.kind === "screenshot") {
    const pop = Math.min(1, block.appear);
    return (
      <div data-hit={`note-shot:${index}`} className="my-2" style={{ opacity: pop, transform: `scale(${0.96 + 0.04 * pop})`, transformOrigin: "left top" }}>
        <div className="overflow-hidden rounded-lg bg-gray-100">
          <LectureFrame kind={block.slide} />
          <div className="px-3 py-2 text-sm text-gray-600">视频截图 - {noteTime(block.time)}</div>
        </div>
      </div>
    );
  }
  const pop = Math.min(1, block.appear ?? 1);
  let left = block.typed;
  const body = block.parts.map((part, i) => {
    if (left <= 0) return null;
    if (part.kind === "timestamp") {
      left -= 1;
      if (left < 0) return null;
      const shown = Math.min(1, part.appear);
      return shown <= 0 ? null : (
        <span
          key={i}
          data-hit={`note-time:${index}`}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-[var(--tau-accent-soft)] px-1.5 py-0.5 text-sm font-medium text-[var(--tau-accent-text)]"
          style={{ opacity: shown, transform: `scale(${0.6 + 0.4 * shown})`, display: "inline-block" }}
        >
          {noteTime(part.time)}
        </span>
      );
    }
    const chars = [...part.text];
    const shown = chars.slice(0, left).join("");
    left -= chars.length;
    return <span key={i}>{shown}</span>;
  });
  const paragraph = (
    <div className="relative flow-root">
      <p className="relative mb-[1.25em] last:mb-0" style={block.kind === "quote" ? { opacity: 0.3 + 0.7 * pop, transform: `scale(${0.97 + 0.03 * pop})`, transformOrigin: "left center" } : undefined}>
        {body}
        {block.caret && <i data-caret className="bg-ink-1 ml-px inline-block h-[1.1em] w-[2px] translate-y-[0.18em]" />}
      </p>
    </div>
  );
  return <div data-hit={`note-block:${index}`}>{block.kind === "quote" ? <QuoteFrame>{paragraph}</QuoteFrame> : paragraph}</div>;
}

const TRANSCRIBE_EMPTY = (
  <>
    还没有转录。转录后能跟着字幕读、划句子摘到笔记，
    <br />
    也能让 AI 基于视频内容回答
  </>
);

export function VideoNotePage({ state }: { state: VideoNoteState }) {
  const {
    title,
    source,
    transcript,
    duration,
    time,
    playing,
    slide,
    slideElapsed,
    subtitle,
    subtitleMounted,
    chapters,
    segments,
    count,
    current,
    scroll = 0,
    quoted = [],
    selection,
    selectHits,
    backToCurrent,
    markers = [],
    markerHover,
    flash,
    cache,
    transcribing,
    segmentsReveal,
    chaptersReveal,
    chaptering,
    pressed,
    menu,
    noteScroll = 0,
    notes,
    chatOpen = 0,
    chat,
  } = state;
  const hasSegments = segments.length > 0;
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex h-[52px] shrink-0 items-center gap-2 pr-3 pl-5">
        <span className="text-ink-2 grid shrink-0 place-items-center">
          <Video className="size-4" strokeWidth={1.75} />
        </span>
        <div className="text-tau-body min-w-0 truncate font-semibold">{title}</div>
        <span className="text-tau-sm text-ink-3 shrink-0 whitespace-nowrap">
          {source} · {transcript}
        </span>
        <span className="flex-1" />
        <span data-hit="chat">
          <IconButton className={clsx(chatOpen > 0 && "bg-selected text-accent-text enabled:hover:bg-selected")}>
            <MessageCircle className="size-4" strokeWidth={1.75} />
          </IconButton>
        </span>
        <span data-hit="more">
          <IconButton>
            <MoreHorizontal className="size-4" strokeWidth={1.75} />
          </IconButton>
        </span>
        {menu && menu.appear > 0 && (
          <MenuSurface style={{ right: 12, top: 46, opacity: menu.appear, transform: `translateY(${(1 - menu.appear) * 4}px)` }}>
            <MenuItem hit="menu:options" highlighted={menu.highlighted === "options"}>
              本次转录设置…
            </MenuItem>
            <MenuItem hit="menu:transcribe" icon={<RefreshCw />} chevron highlighted={menu.highlighted === "transcribe"}>
              重新转录
            </MenuItem>
            <MenuItem hit="menu:optimize" icon={<Zap />} highlighted={menu.highlighted === "optimize"}>
              AI 优化断句
            </MenuItem>
            <MenuItem hit="menu:chapters" icon={<ListTree />} highlighted={menu.highlighted === "chapters"}>
              重新生成章节
            </MenuItem>
            <MenuItem hit="menu:subtitle" icon={<Subtitles />} highlighted={menu.highlighted === "subtitle"}>
              {menu.mounted ? "取消挂载字幕" : "挂载字幕"}
            </MenuItem>
            <MenuSeparator />
            <MenuItem hit="menu:ebook" icon={<BookText />} highlighted={menu.highlighted === "ebook"}>
              AI 导出电子书
            </MenuItem>
          </MenuSurface>
        )}
      </div>

      <div className="relative flex min-h-0 flex-1">
        {/* 左栏：播放器 + 字幕，默认占（去掉对话栏后）的 56% */}
        <div className="h-full shrink-0" style={{ width: `calc((100% - ${480 * chatOpen}px) * 0.56)` }}>
          <div className="flex h-full min-h-0 flex-col pb-4">
            <div className="shrink-0 pr-3 pb-2 pl-4">
              {cache ? (
                <CacheLoader source={source} progress={cache.progress} done={cache.done} />
              ) : (
                <VideoPlayerCard
                  time={time}
                  duration={duration}
                  playing={playing}
                  slide={slide}
                  slideElapsed={slideElapsed}
                  subtitle={subtitle}
                  subtitleMounted={subtitleMounted}
                  chapters={chapters.map(chapter => ({ start: chapter.start / 1000, title: chapter.title }))}
                  markers={markers}
                  markerHover={markerHover}
                  flash={flash}
                />
              )}
            </div>
            <div className="text-tau-sm text-ink-3 flex h-9 shrink-0 items-center gap-1.5 px-6">
              <span className="text-tau-body text-ink-1 font-semibold">转录</span>
              {hasSegments && !transcribing && (
                <span data-hit="transcript-count">
                  · {count.segments} 段{chaptering ? " · 正在分章节…" : chapters.length ? ` · ${count.chapters} 章` : ""}
                </span>
              )}
              {transcribing && (
                <span data-hit="transcribe-progress" className="inline-flex min-w-0 items-center gap-1.5">
                  <SpinnerLook className="size-3" />
                  <span className="truncate">{transcribing}</span>
                </span>
              )}
            </div>
            {hasSegments ? (
              <div className="relative flex min-h-0 flex-1 flex-col">
                <TranscriptList
                  segments={segments}
                  chapters={chapters}
                  current={current}
                  quoted={quoted}
                  scroll={scroll}
                  selection={selection}
                  selectHits={selectHits}
                  reveal={segmentsReveal}
                  chaptersReveal={chaptersReveal}
                />
                <BackToCurrent appear={backToCurrent} />
              </div>
            ) : transcribing ? (
              <div data-hit="transcript-pending" className="text-tau-meta text-ink-3 flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
                <span>转录完成后，字幕会出现在这里</span>
                <span className="text-tau-sm">可以先开始记笔记，时间戳和截帧不依赖转录</span>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 pb-10 text-center">
                <Captions className="text-ink-3 size-6" strokeWidth={1.5} />
                <p className="text-tau-meta text-ink-2">{TRANSCRIBE_EMPTY}</p>
                <span data-hit="transcribe">
                  <Pressed on={pressed === "transcribe"}>
                    <Button size="sm" variant="primary">
                      开始转录
                    </Button>
                  </Pressed>
                </span>
                <p className="text-tau-sm text-ink-3">自动识别语言，需要指定语言可在右上角 ⋯ 中选择</p>
              </div>
            )}
          </div>
        </div>
        <div className="bg-line-2 w-px shrink-0" />

        {/* 右栏：笔记 */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-doc-root>
          {notes.kind === "empty" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center" style={{ opacity: 1 - (notes.appear ?? 0) }}>
              <p className="text-tau-title text-ink-1 font-semibold">还没有笔记</p>
              <p className="text-tau-meta text-ink-3">边看边记，时间戳和截帧都能一键插入</p>
              <Button size="sm" variant="primary" icon={Plus}>
                新建笔记
              </Button>
            </div>
          ) : (
            <>
              <div className="flex h-[52px] shrink-0 items-center gap-1 pr-3 pl-4" style={{ opacity: notes.appear ?? 1 }}>
                <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
                  <span className="text-tau-sm ease-tau-out bg-selected text-ink-1 h-[26px] max-w-[180px] shrink-0 truncate rounded-full px-2.5 font-medium">{notes.tab}</span>
                  <IconButton className="size-[26px] shrink-0">
                    <Plus className="size-3.5" strokeWidth={1.75} />
                  </IconButton>
                </div>
                <span data-hit="insert-time">
                  <Pressed on={pressed === "insert-time"}>
                    <IconButton>
                      <Clock3 className="size-4" strokeWidth={1.75} />
                    </IconButton>
                  </Pressed>
                </span>
                <span data-hit="capture">
                  <Pressed on={pressed === "capture"}>
                    <IconButton>
                      <Camera className="size-4" strokeWidth={1.75} />
                    </IconButton>
                  </Pressed>
                </span>
                <IconButton>
                  <MoreHorizontal className="size-4" strokeWidth={1.75} />
                </IconButton>
              </div>
              <div data-hit="note-body" className="min-h-0 flex-1 overflow-hidden">
                <div className="text-ink-1 mx-auto max-w-[720px] px-7 pt-2 pb-16 text-[16px] leading-[1.75]" style={noteScroll ? { transform: `translateY(${-noteScroll}px)` } : undefined}>
                  <div className="text-tau-title-lg text-ink-3 mb-3 font-semibold">无标题笔记</div>
                  {notes.blocks.length === 0 && <div className="text-ink-3">边看边记…</div>}
                  {notes.blocks.map((block, index) => (
                    <NoteBlockView key={index} block={block} index={index} />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {chatOpen > 0 && chat && (
          <ChatColumn open={chatOpen}>
            <VideoNoteChat {...chat} />
          </ChatColumn>
        )}
      </div>
    </div>
  );
}
