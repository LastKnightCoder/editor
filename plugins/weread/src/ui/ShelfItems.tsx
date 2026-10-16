/** 书架条目：「在读」续读卡、封面格、列表排布（行式，点列头排序） */

import { ArrowDown } from "lucide-react";
import { cn } from "@tau/ui";
import { formatMinutes, formatReadDay, type ShelfSort, type WeReadBook } from "../model";
import { BookCover, ProgressBar, StatusDot } from "./bits";

export function ReadingCard({ book, onOpen }: { book: WeReadBook; onOpen(): void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="hover:bg-hover ease-tau-out flex min-w-0 gap-3.5 rounded-[var(--tau-radius-lg)] p-3.5 text-left outline-none transition-colors duration-150 focus-visible:shadow-[var(--tau-focus-ring)]"
    >
      <BookCover book={book} className="w-[64px] self-start" titleClassName="text-[9px]" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 py-0.5">
        <span className="truncate text-[14px] font-semibold">{book.title}</span>
        <span className="text-tau-sm text-ink-3 truncate">{book.author}</span>
        <span className="text-tau-sm text-ink-2 mt-1 truncate tabular-nums">
          最近阅读 {formatReadDay(book.lastRead)}
          {book.minutes > 0 && (
            <span className="text-ink-3"> · 累计 {formatMinutes(book.minutes)}</span>
          )}
        </span>
        <span className="text-tau-micro text-ink-3 mt-auto flex items-center gap-2 tabular-nums">
          <ProgressBar book={book} className="flex-1" />
          {book.progress}%
        </span>
      </span>
    </button>
  );
}

export function CoverTile({ book, onOpen }: { book: WeReadBook; onOpen(): void }) {
  return (
    <button type="button" onClick={onOpen} className="group min-w-0 text-left outline-none">
      <BookCover
        book={book}
        titleClassName="text-[13px]"
        className="ease-tau-out w-full transition-shadow duration-200 group-hover:shadow-[var(--tau-shadow-float)] group-focus-visible:shadow-[var(--tau-focus-ring)]"
      >
        {book.status === "reading" && (
          <span className="bg-ink-1/20 absolute inset-x-0 bottom-0 h-[3px]">
            <span className="bg-accent block h-full" style={{ width: `${book.progress}%` }} />
          </span>
        )}
      </BookCover>
      <span className="mt-2.5 line-clamp-2 text-[13px] font-medium leading-[1.4]">
        {book.title}
      </span>
      <span className="text-tau-micro text-ink-3 mt-0.5 flex gap-2 tabular-nums">
        {book.status === "finished" ? (
          <span className="text-ok">读完</span>
        ) : book.status === "reading" ? (
          <span>{book.progress}%</span>
        ) : null}
        {book.notes > 0 ? (
          <span>{book.notes} 划线</span>
        ) : (
          <span className="truncate">{book.author}</span>
        )}
      </span>
    </button>
  );
}

const LIST_COLS =
  "grid grid-cols-[minmax(220px,2.4fr)_minmax(80px,1fr)_72px_minmax(120px,1.2fr)_96px_minmax(96px,1fr)_76px] items-center gap-4";

const SORTABLE: { key: ShelfSort; label: string }[] = [
  { key: "progress", label: "进度" },
  { key: "minutes", label: "阅读时长" },
  { key: "notes", label: "笔记" },
  { key: "last", label: "最近阅读" },
];

export function ShelfList({
  books,
  sort,
  onSort,
  onOpen,
}: {
  books: WeReadBook[];
  sort: ShelfSort;
  onSort(sort: ShelfSort): void;
  onOpen(book: WeReadBook): void;
}) {
  const head = (key: ShelfSort, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => onSort(key)}
      className={cn(
        "hover:text-ink-1 inline-flex items-center gap-0.5 text-left",
        sort === key && "text-ink-1 font-medium"
      )}
    >
      {label}
      {sort === key && <ArrowDown className="size-3" strokeWidth={2} />}
    </button>
  );
  return (
    <div className="-mx-3">
      <div className={cn(LIST_COLS, "text-tau-sm text-ink-3 px-3 py-2")}>
        <span>书名 / 作者</span>
        <span>分类</span>
        <span>状态</span>
        {SORTABLE.map(({ key, label }) => head(key, label))}
      </div>
      {books.map(book => (
        <button
          key={book.id}
          type="button"
          onClick={() => onOpen(book)}
          className={cn(
            LIST_COLS,
            "hover:bg-hover w-full rounded-[var(--tau-radius-md)] px-3 py-2 text-left outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
          )}
        >
          <span className="flex min-w-0 items-center gap-3">
            <BookCover
              bare
              book={book}
              className="shadow-card w-[30px] rounded-[2px_3px_3px_2px]"
            />
            <span className="min-w-0">
              <span className="block truncate font-medium">{book.title}</span>
              <span className="text-tau-sm text-ink-3 block truncate">{book.author}</span>
            </span>
          </span>
          <span className="text-tau-sm text-ink-2 truncate">{book.archive || "—"}</span>
          <StatusDot status={book.status} />
          <span className="text-tau-sm text-ink-3 flex items-center gap-2 tabular-nums">
            <ProgressBar book={book} className="flex-1" />
            <span className="w-8 text-right">{book.progress}%</span>
          </span>
          <span className="text-tau-sm text-ink-2 tabular-nums">
            {book.minutes ? formatMinutes(book.minutes) : "—"}
          </span>
          <span className="text-tau-sm text-ink-2 truncate tabular-nums">
            {book.notes + book.reviews > 0
              ? `${book.notes} 划线${book.reviews ? ` · ${book.reviews} 想法` : ""}`
              : "—"}
          </span>
          <span className="text-tau-sm text-ink-2 tabular-nums">
            {formatReadDay(book.lastRead)}
          </span>
        </button>
      ))}
    </div>
  );
}
