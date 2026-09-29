/**
 * PDF 封面：首页缩略图；还没生成（或加载失败）时按 id 派生粉彩底 + 文件名。
 * 宽度由调用方给（className），高宽比固定 1:1.3；远程 / 文件丢失标在右下角：
 * 文字封面并入底行（与「PDF · N 页」同一行），缩略图上只放一个图标。
 */

import { useState, type ReactNode } from "react";
import { Cloud, FileX } from "lucide-react";
import { cn } from "@tau/ui";
import { coverTone, type PdfEntry } from "../model";

const TONE_BG = {
  1: "bg-tag-1-soft text-tag-1",
  2: "bg-tag-2-soft text-tag-2",
  3: "bg-tag-3-soft text-tag-3",
  4: "bg-tag-4-soft text-tag-4",
  5: "bg-tag-5-soft text-tag-5",
} as const;

export function PdfCover({
  entry,
  className,
  bare = false,
  children,
}: {
  entry: PdfEntry;
  className?: string;
  /** 缩略尺寸：不写文件名、不挂角标 */
  bare?: boolean;
  children?: ReactNode;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(entry.thumbnailUrl) && failedUrl !== entry.thumbnailUrl;
  const mark = bare ? null : entry.fileMissing ? (
    <SourceMark icon={FileX} label="文件丢失" className="text-danger" />
  ) : entry.isLocal ? null : (
    <SourceMark icon={Cloud} label="远程" />
  );
  return (
    <div
      className={cn(
        "shadow-card relative aspect-[1/1.3] shrink-0 overflow-hidden rounded-[4px]",
        showImage ? "bg-surface" : TONE_BG[coverTone(entry.id)],
        entry.fileMissing && "opacity-50 grayscale",
        className
      )}
    >
      {showImage ? (
        <>
          <img
            src={entry.thumbnailUrl!}
            alt=""
            loading="lazy"
            draggable={false}
            onError={() => setFailedUrl(entry.thumbnailUrl)}
            className="size-full object-cover object-top"
          />
          {mark && (
            <span className="bg-surface/85 text-ink-2 absolute bottom-1.5 right-1.5 grid size-5 place-items-center rounded-full">
              {mark}
            </span>
          )}
        </>
      ) : bare ? null : (
        <div className="flex size-full flex-col px-[12%] pb-[10%] pt-[14%]">
          <span className="line-clamp-5 text-[13px] font-semibold leading-[1.35] [overflow-wrap:anywhere]">
            {entry.title}
          </span>
          <span className="mt-auto flex items-center gap-2 text-[10px] font-medium tracking-[0.08em] opacity-70">
            <span className="min-w-0 flex-1 truncate">
              PDF{entry.pageCount ? ` · ${entry.pageCount} 页` : ""}
            </span>
            {mark}
          </span>
        </div>
      )}
      {children}
    </div>
  );
}

/** 来源标记：图标 + 读屏文案（缩略图上只露图标，文字封面底行上同样只露图标，悬停出 title） */
function SourceMark({
  icon: Icon,
  label,
  className,
}: {
  icon: typeof Cloud;
  label: string;
  className?: string;
}) {
  return (
    <span title={label} aria-label={label} className={cn("inline-flex shrink-0", className)}>
      <Icon className="size-3" strokeWidth={1.75} />
    </span>
  );
}
