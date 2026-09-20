/**
 * 文章 hero（mockups/article-detail/plan-a4-quiet.html 定稿形态）：
 * 列内 720 圆角封面（banner 本地图 / 派生色兜底）+ 墨色遮罩 + 标题行内编辑 +
 * 元信息行；hover 封面中央浮出「更换封面」（Notion 式，上传流程由调用方承担）。
 */

import { ImagePlus } from "lucide-react";
import type { IArticle } from "@/types";
import { formatDate, getContentLength } from "@/utils";
import LocalImage from "@/components/LocalImage";
import { cn } from "@tau/ui";

import { coverGradientOf } from "../views/ArticleCard";

interface ArticleHeroProps {
  article: IArticle;
  onTitleChange: (title: string) => void;
  /** hover「更换封面」点击（文件选择与上传流程在调用方） */
  onChangeCover: () => void;
  changingCover?: boolean;
  className?: string;
}

function objectPositionOf(position?: string): string {
  if (position === "top") return "center 0%";
  if (position === "bottom") return "center 100%";
  if (position === "center" || !position) return "center";
  return `center ${position}`;
}

export function ArticleHero({
  article,
  onTitleChange,
  onChangeCover,
  changingCover,
  className,
}: ArticleHeroProps) {
  // 实时口径：编辑中即时反映（count 字段只在保存时落库，展示不走它）
  const words = getContentLength(article.content ?? []);

  return (
    <div
      className={cn(
        "rounded-tau-lg group relative mx-auto mt-[18px] aspect-[21/9] w-[720px] max-w-[calc(100%-52px)] overflow-hidden",
        className
      )}
    >
      {article.bannerBg ? (
        <LocalImage
          url={article.bannerBg}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: objectPositionOf(article.bannerPosition) }}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ backgroundImage: coverGradientOf(article.id) }}
        />
      )}

      {/* 底部墨色渐变：保证白字可读（banner 与派生色兜底两种底都成立） */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(42,32,22,0.05)_0%,rgba(42,32,22,0.14)_46%,rgba(42,32,22,0.62)_100%)]" />

      {/* hover 封面中央浮出（Notion 式），封面更换中不重复触发 */}
      <button
        type="button"
        onClick={onChangeCover}
        disabled={changingCover}
        title="更换封面"
        className="ease-tau-out absolute left-1/2 top-1/2 flex h-7 -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full bg-[rgba(26,19,12,0.55)] px-3.5 text-[11.5px] text-[rgba(255,248,239,0.92)] opacity-0 backdrop-blur-[6px] transition-opacity duration-150 group-hover:opacity-100"
      >
        <ImagePlus className="size-[13px]" strokeWidth={1.75} />
        {changingCover ? "上传中…" : "更换封面"}
      </button>

      <div className="relative flex h-full w-full flex-col justify-end px-[30px] pb-6">
        <div className="mb-2.5 flex items-center gap-2.5 text-[12px] tabular-nums text-[rgba(255,248,239,0.85)]">
          <span>{formatDate(article.create_time, true)} 创建</span>
          <span className="size-[3px] rounded-full bg-[rgba(255,248,239,0.55)]" />
          <span>{formatDate(article.update_time, true)} 编辑</span>
          <span className="size-[3px] rounded-full bg-[rgba(255,248,239,0.55)]" />
          <span>{words} 字</span>
        </div>
        <input
          value={article.title || ""}
          onChange={event => onTitleChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          placeholder="未命名标题"
          aria-label="文章标题"
          className="rounded-tau-sm w-full max-w-[24em] bg-transparent text-[27px] font-semibold leading-[1.35] tracking-[-0.01em] text-[rgba(255,248,239,0.96)] outline-none placeholder:text-[rgba(255,248,239,0.45)]"
        />
      </div>
    </div>
  );
}
