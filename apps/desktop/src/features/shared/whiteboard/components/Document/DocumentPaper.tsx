/**
 * 文档纸面排版：画布上的文档卡与展开后的阅读纸用同一份排版——卡片是它按版宽排好后整体缩小，
 * 展开动画只做 transform，文字不重排。正文由调用方传入（画布：只读首屏；阅读纸：ContentEditor）。
 */

import { useState, type ReactNode } from "react";
import dayjs from "dayjs";
import type { DocumentKind } from "@tau/whiteboard";
import { cn } from "@tau/ui";
import LocalImage from "@/components/LocalImage";
import { coverGradientOf } from "@/utils/cover";
import { DOCUMENT_KIND_LABEL, type DocumentSource } from "./source";

/** 版宽：卡片是短内容，窄一档，缩小后字更好认 */
export const DOCUMENT_PAPER_WIDTH: Record<DocumentKind, number> = {
  card: 460,
  article: 620,
  "project-item": 620,
};

const PAPER_CLASS: Record<DocumentKind, string> = {
  card: "px-9 pb-12 pt-[30px]",
  article: "px-[52px] pb-[72px] pt-10",
  "project-item": "px-[52px] pb-[72px] pt-10",
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

/** 封面 / 项目名 / 标签 + 标题；卡片没有标题，只有标签 */
export function DocumentHead({ source, title }: { source: DocumentSource; title?: ReactNode }) {
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
        {title ?? (source.title || "无标题")}
      </h1>
    </header>
  );
}

export function DocumentMeta({ source }: { source: DocumentSource }) {
  return (
    <div className={cn("text-ink-3 text-[13px]", source.kind === "card" ? "mt-4" : "-mt-3 mb-6")}>
      {DOCUMENT_KIND_LABEL[source.kind]} · 更新于 {dayjs(source.updateTime).format("M月D日")}
    </div>
  );
}

/** 一张纸：固定版宽，内边距随类型；children 是正文 */
export function DocumentPaper({
  source,
  title,
  children,
  className,
}: {
  source: DocumentSource;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const card = source.kind === "card";
  return (
    <div
      className={cn("text-ink-1", PAPER_CLASS[source.kind], className)}
      style={{ width: DOCUMENT_PAPER_WIDTH[source.kind] }}
    >
      <DocumentHead source={source} title={title} />
      {!card && <DocumentMeta source={source} />}
      {children}
      {card && <DocumentMeta source={source} />}
    </div>
  );
}
