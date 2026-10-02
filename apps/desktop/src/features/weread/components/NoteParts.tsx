/** 笔记页的内容件：书头、书评、划线条目、过滤条、目录 */

import {
  BookOpen,
  CircleHelp,
  Copy,
  Layers,
  MessageSquareQuote,
  PenLine,
  RefreshCw,
} from "lucide-react";
import { Button, FilterPill, IconButton, Tooltip, cn, toast } from "@tau/ui";
import {
  HIGHLIGHT_COLORS,
  formatMinutes,
  formatReadDay,
  type BookNote,
  type HighlightColor,
  type NoteChapter,
  type NoteFilter,
  type WeReadBook,
} from "../model";
import { BookCover, ProgressBar } from "./bits";
import { HIGHLIGHT_DOT, SERIF, markClass } from "./styles";

async function copy(text: string) {
  await navigator.clipboard.writeText(text);
  toast.success("已复制");
}

export function BookHeader({
  book,
  counts,
  connected,
  refreshing,
  onOpenWeb,
  onRefresh,
  onCopyMarkdown,
}: {
  book: WeReadBook;
  counts: { highlights: number; reviews: number };
  connected: boolean;
  refreshing: boolean;
  onOpenWeb?: () => void;
  onRefresh(): void;
  onCopyMarkdown?: () => void;
}) {
  return (
    <header className="flex items-start gap-5">
      <BookCover book={book} className="w-[88px]" titleClassName="text-[12px]" />
      <div className="min-w-0 flex-1">
        <h1 className={cn(SERIF, "text-[24px] font-semibold leading-[1.3] tracking-[0.02em]")}>
          {book.title}
        </h1>
        <p className="text-tau-body text-ink-2 mt-0.5">
          {[book.author, book.publisher].filter(Boolean).join(" · ")}
        </p>
        <div className="text-tau-micro text-ink-3 mt-2.5 flex max-w-[320px] items-center gap-2 tabular-nums">
          <ProgressBar book={book} className="flex-1" />
          {book.status === "finished" ? "读完" : `${book.progress}%`}
        </div>
        <p className="text-tau-sm text-ink-3 mt-2 flex flex-wrap gap-x-3.5 gap-y-1 tabular-nums">
          {book.minutes > 0 && (
            <span>
              阅读 <b className="text-ink-1 font-medium">{formatMinutes(book.minutes)}</b>
            </span>
          )}
          <span>
            划线 <b className="text-ink-1 font-medium">{counts.highlights}</b>
          </span>
          <span>
            想法 <b className="text-ink-1 font-medium">{counts.reviews}</b>
          </span>
          {book.lastRead && (
            <span>
              最近阅读 <b className="text-ink-1 font-medium">{formatReadDay(book.lastRead)}</b>
            </span>
          )}
        </p>
        <div className="-ml-2 mt-3 flex flex-wrap gap-1">
          {onOpenWeb && (
            <Button variant="ghost" size="sm" icon={BookOpen} onClick={onOpenWeb}>
              在微信读书中打开
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            icon={RefreshCw}
            loading={refreshing}
            loadingText="拉取中…"
            disabled={!connected}
            title={connected ? undefined : "连接微信读书后才能拉取"}
            onClick={onRefresh}
          >
            重新拉取笔记
          </Button>
          {onCopyMarkdown && (
            <Button variant="ghost" size="sm" icon={Copy} onClick={onCopyMarkdown}>
              复制为 Markdown
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

export function BookReviews({ reviews }: { reviews: { id: string; paragraphs: string[] }[] }) {
  if (!reviews.length) return null;
  return (
    <div className="bg-accent-soft mt-5 flex flex-col gap-3 rounded-[var(--tau-radius-md)] px-4 py-3.5">
      {reviews.map(review => (
        <div key={review.id}>
          <p className="text-tau-sm text-accent-text mb-1 flex items-center gap-1.5 font-medium">
            <PenLine className="size-3.5" strokeWidth={1.75} />
            我的书评
          </p>
          {review.paragraphs.map((p, i) => (
            <p key={i} className="text-tau-body-lg leading-[1.85]">
              {p}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

export function NoteFilterBar({
  filter,
  colors,
  onChange,
}: {
  filter: NoteFilter;
  /** 本书出现过的划线颜色 */
  colors: HighlightColor[];
  onChange(filter: NoteFilter): void;
}) {
  return (
    <div className="bg-surface sticky top-0 z-[2] -mx-1 mt-5 flex items-center gap-1.5 px-1 py-2.5">
      <FilterPill active={filter === "all"} onClick={() => onChange("all")} label="全部" />
      <FilterPill
        active={filter === "review"}
        onClick={() => onChange(filter === "review" ? "all" : "review")}
        label="有想法"
      />
      {colors.length > 1 && <span className="w-1.5" />}
      {colors.length > 1 &&
        HIGHLIGHT_COLORS.filter(c => colors.includes(c.value)).map(c => (
          <Tooltip key={c.value} content={`${c.label}色划线`}>
            <button
              type="button"
              aria-pressed={filter === c.value}
              aria-label={`${c.label}色划线`}
              onClick={() => onChange(filter === c.value ? "all" : c.value)}
              className={cn(
                "hover:bg-hover grid size-6 place-items-center rounded-full outline-none focus-visible:shadow-[var(--tau-focus-ring)]",
                filter === c.value && "shadow-[inset_0_0_0_1.5px_var(--tau-ink-3)]"
              )}
            >
              <span className={cn("size-2.5 rounded-full", HIGHLIGHT_DOT[c.value])} />
            </button>
          </Tooltip>
        ))}
    </div>
  );
}

/** 想法：浅 accent 底的批注块，是笔记页的视觉重点（纯划线只有原文） */
function Thought({ paragraphs, className }: { paragraphs: string[]; className?: string }) {
  return (
    <div
      className={cn(
        "bg-accent-soft text-tau-body text-ink-1 flex gap-2 rounded-[var(--tau-radius-md)] px-3 py-2 leading-[1.75]",
        className
      )}
    >
      <MessageSquareQuote className="text-accent-text mt-1 size-3.5 shrink-0" strokeWidth={1.75} />
      <div>
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </div>
  );
}

function NoteItem({
  note,
  onToCard,
  onToQuestion,
}: {
  note: BookNote;
  onToCard?: (note: BookNote) => void;
  onToQuestion?: (note: BookNote) => void;
}) {
  const text = [...note.paragraphs, ...(note.review.length ? ["", ...note.review] : [])].join("\n");
  return (
    <div
      data-note-id={note.id}
      className="bg-hover hover:bg-press group relative rounded-[var(--tau-radius-md)] px-4 py-3 transition-colors duration-150"
    >
      {note.paragraphs.length > 0 && (
        <div className={cn(SERIF, "text-ink-1 text-[15.5px] leading-[1.95]")}>
          {note.paragraphs.map((p, i) => (
            <p key={i}>
              <mark
                className={cn("bg-transparent text-inherit", markClass(note.style, note.color))}
              >
                {p}
              </mark>
            </p>
          ))}
        </div>
      )}
      {note.review.length > 0 && <Thought paragraphs={note.review} className="mt-2.5" />}
      {/* 固定槽位淡入，不顶开布局 */}
      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
        {onToCard && note.paragraphs.length > 0 && (
          <IconButton
            title="转为卡片"
            onClick={() => onToCard(note)}
            className="bg-surface shadow-lift size-[26px] rounded-[8px]"
          >
            <Layers className="size-[13px]" strokeWidth={1.75} />
          </IconButton>
        )}
        {onToQuestion && note.paragraphs.length > 0 && (
          <IconButton
            title="转为问题"
            onClick={() => onToQuestion(note)}
            className="bg-surface shadow-lift size-[26px] rounded-[8px]"
          >
            <CircleHelp className="size-[13px]" strokeWidth={1.75} />
          </IconButton>
        )}
        <IconButton
          title="复制"
          onClick={() => void copy(text)}
          className="bg-surface shadow-lift size-[26px] rounded-[8px]"
        >
          <Copy className="size-[13px]" strokeWidth={1.75} />
        </IconButton>
      </div>
    </div>
  );
}

export function ChapterSection({
  chapter,
  index,
  onToCard,
  onToQuestion,
}: {
  chapter: NoteChapter;
  index: number;
  onToCard?: (note: BookNote) => void;
  onToQuestion?: (note: BookNote) => void;
}) {
  const count = chapter.notes.length + chapter.thoughts.length;
  return (
    <section data-chapter={chapter.key} className="mt-9 scroll-mt-14">
      <h2 className="mb-3 flex items-baseline gap-2 text-[15px] font-semibold">
        <span className="font-tau-mono text-ink-3 text-[12px] font-medium tabular-nums">
          {String(index + 1).padStart(2, "0")}
        </span>
        {chapter.title}
        <span className="text-tau-sm text-ink-3 font-normal tabular-nums">{count}</span>
      </h2>
      {/* 条目之间靠留白分组（不画分隔线） */}
      <div className="flex flex-col gap-2.5">
        {chapter.notes.map(note => (
          <NoteItem key={note.id} note={note} onToCard={onToCard} onToQuestion={onToQuestion} />
        ))}
      </div>
      {chapter.thoughts.map((t, i) => (
        <Thought key={i} paragraphs={t} className="mt-2.5" />
      ))}
    </section>
  );
}

export function NoteToc({
  chapters,
  active,
  onJump,
}: {
  chapters: NoteChapter[];
  active: string | null;
  onJump(key: string): void;
}) {
  return (
    <nav aria-label="目录" className="flex flex-col gap-px">
      <p className="text-tau-sm text-ink-3 flex justify-between px-2.5 pb-1.5">
        <span>目录</span>
        <span className="tabular-nums">{chapters.length} 章</span>
      </p>
      {chapters.map(ch => (
        <button
          key={ch.key}
          type="button"
          onClick={() => onJump(ch.key)}
          className={cn(
            "text-tau-meta hover:bg-hover flex h-[30px] shrink-0 items-center gap-2 rounded-[var(--tau-radius-sm)] px-2.5 text-left outline-none focus-visible:shadow-[var(--tau-focus-ring)]",
            active === ch.key ? "bg-hover text-ink-1 font-medium" : "text-ink-2"
          )}
        >
          <span className="min-w-0 flex-1 truncate">{ch.title}</span>
          <span className="text-tau-tiny text-ink-3 tabular-nums">
            {ch.notes.length + ch.thoughts.length}
          </span>
        </button>
      ))}
    </nav>
  );
}
