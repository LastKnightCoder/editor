/** 微信读书域的小件：封面、进度条、状态点 */

import { useState, type ReactNode } from "react";
import { cn } from "@tau/ui";
import { STATUS_LABEL, coverTone, type ReadingStatus, type WeReadBook } from "../model";
import { SERIF } from "./styles";

const TONE_BG = {
  1: "bg-tag-1-soft text-tag-1",
  2: "bg-tag-2-soft text-tag-2",
  3: "bg-tag-3-soft text-tag-3",
  4: "bg-tag-4-soft text-tag-4",
  5: "bg-tag-5-soft text-tag-5",
} as const;

/**
 * 封面：微信读书封面图；无图或加载失败时按书 id 派生粉彩底 + 书名。
 * 宽度由调用方给（className），高宽比固定 3:4.3。
 */
export function BookCover({
  book,
  className,
  titleClassName,
  bare = false,
  children,
}: {
  book: Pick<WeReadBook, "id" | "title" | "author" | "cover">;
  className?: string;
  /** 兜底封面上书名的字号 */
  titleClassName?: string;
  /** 缩略尺寸：兜底封面不写书名 */
  bare?: boolean;
  children?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(book.cover) && !failed;
  return (
    <div
      className={cn(
        "shadow-lift relative aspect-[3/4.3] shrink-0 overflow-hidden rounded-[3px_6px_6px_3px]",
        !showImage && TONE_BG[coverTone(book.id)],
        className
      )}
    >
      {showImage ? (
        <img
          src={book.cover}
          alt=""
          loading="lazy"
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : bare ? null : (
        <div className="flex size-full flex-col px-[12%] pb-[10%] pt-[14%]">
          <span className={cn(SERIF, "line-clamp-4 font-semibold leading-[1.35]", titleClassName)}>
            {book.title}
          </span>
          <span className="mt-auto line-clamp-1 text-[0.7em] opacity-80">{book.author}</span>
        </div>
      )}
      {children}
    </div>
  );
}

export function ProgressBar({ book, className }: { book: WeReadBook; className?: string }) {
  return (
    <div className={cn("bg-line-1 h-[3px] overflow-hidden rounded-full", className)}>
      <div
        className={cn("h-full rounded-full", book.status === "finished" ? "bg-ok" : "bg-accent")}
        style={{ width: `${book.progress}%` }}
      />
    </div>
  );
}

const STATUS_DOT: Record<ReadingStatus, string> = {
  reading: "bg-accent",
  finished: "bg-ok",
  unread: "bg-ink-3",
};

export function StatusDot({ status }: { status: ReadingStatus }) {
  return (
    <span className="text-tau-sm text-ink-2 inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} />
      {STATUS_LABEL[status]}
    </span>
  );
}
