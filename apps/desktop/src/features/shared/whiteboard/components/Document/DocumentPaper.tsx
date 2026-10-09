/**
 * 文档纸面排版：画布上的文档卡与展开后的阅读纸共用。卡片按版宽排好后整体缩小；阅读纸 fill 随容器宽排版，以阅读版心为上限水平居中。
 * 正文由调用方传入（画布：只读首屏；阅读纸：ContentEditor）。
 */

import { useState, type ReactNode } from "react";
import dayjs from "dayjs";
import type { DocumentKind } from "@tau/whiteboard";
import { cn } from "@tau/ui";
import LocalImage from "@/components/LocalImage";
import { coverGradientOf } from "@/utils/cover";
import { DOCUMENT_KIND_LABEL, type DiaryMoment, type DocumentSource } from "./source";
import { DOCUMENT_PAPER_WIDTH, READER_PAPER_MAX_WIDTH, isCompactDocument } from "./layout";

const PAPER_CLASS: Record<DocumentKind, string> = {
  card: "px-9 pb-12 pt-[30px]",
  article: "px-[52px] pb-[72px] pt-10",
  "project-item": "px-[52px] pb-[72px] pt-10",
  "diary-moment": "px-9 pb-12 pt-[30px]",
};

function ArticleCover({ source }: { source: DocumentSource }) {
  const [failed, setFailed] = useState<string>();
  const banner = source.banner && source.banner !== failed ? source.banner : "";
  return (
    <div
      className="relative -mx-[52px] -mt-10 mb-[30px] h-[190px] overflow-hidden"
      style={banner ? undefined : { backgroundImage: coverGradientOf(source.id) }}
    >
      {banner && (
        <LocalImage
          url={banner}
          className="absolute inset-0 size-full select-none object-cover"
          draggable={false}
          onLoadError={() => setFailed(banner)}
        />
      )}
    </div>
  );
}

function Tags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <div className="mb-3.5 flex flex-wrap gap-1.5">
      {tags.map(tag => (
        <span key={tag} className="bg-hover text-ink-2 rounded-[6px] px-2 text-[12px] leading-5">
          #{tag}
        </span>
      ))}
    </div>
  );
}

/** 碎碎念的头：哪一天、几点，当天的天气心情 */
function MomentKicker({ moment }: { moment: DiaryMoment }) {
  return (
    <div className="text-ink-3 mb-3 flex items-center gap-2 text-[13px] tabular-nums">
      <span>{dayjs(moment.day).format("YYYY年M月D日 dddd")}</span>
      <span>{dayjs(moment.time).format("HH:mm")}</span>
      {moment.moods.length > 0 && (
        <span className="text-[15px] leading-none">{moment.moods.join(" ")}</span>
      )}
    </div>
  );
}

/** 封面 / 项目名 / 标签 + 标题；卡片与碎碎念没有标题，只有标签（碎碎念另有日期时间） */
function DocumentHead({ source }: { source: DocumentSource }) {
  if (source.moment)
    return (
      <>
        <MomentKicker moment={source.moment} />
        <Tags tags={source.tags} />
      </>
    );
  if (source.kind === "card") return <Tags tags={source.tags} />;
  return (
    <header className="mb-6">
      {source.kind === "article" ? (
        <ArticleCover source={source} />
      ) : (
        <div className="text-ink-3 mb-2 flex items-center gap-2 text-[13px]">
          <span className="bg-accent-soft text-accent rounded-[6px] px-2 text-[12px] leading-5">
            项目
          </span>
          {source.projectName}
        </div>
      )}
      <h1 className="text-ink-1 text-[30px] font-semibold leading-[1.32] tracking-[-0.01em]">
        {source.title || "无标题"}
      </h1>
    </header>
  );
}

function DocumentMeta({ source, short }: { source: DocumentSource; short: boolean }) {
  return (
    <div className={cn("text-ink-3 text-[13px]", short ? "mt-4" : "-mt-3 mb-6")}>
      {DOCUMENT_KIND_LABEL[source.kind]} · 更新于 {dayjs(source.updateTime).format("M月D日")}
    </div>
  );
}

/** 一张纸：固定版宽（fill 时随容器宽、不超阅读版心），内边距随类型；children 是正文。短内容（卡片、碎碎念）元信息在正文之后 */
export function DocumentPaper({
  source,
  children,
  className,
  fill,
}: {
  source: DocumentSource;
  children: ReactNode;
  className?: string;
  fill?: boolean;
}) {
  const short = isCompactDocument(source.kind);
  return (
    <div
      className={cn("text-ink-1", PAPER_CLASS[source.kind], fill && "mx-auto w-full", className)}
      style={
        fill ? { maxWidth: READER_PAPER_MAX_WIDTH } : { width: DOCUMENT_PAPER_WIDTH[source.kind] }
      }
    >
      <DocumentHead source={source} />
      {!short && <DocumentMeta source={source} short={false} />}
      {children}
      {short && <DocumentMeta source={source} short />}
    </div>
  );
}
