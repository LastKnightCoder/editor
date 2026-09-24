/**
 * 文章 hero：页头在上（标题行内编辑 · 元信息行 + 右侧 actions 槽位，如 ⋯ 菜单），
 * 下方 720 圆角封面（banner 本地图 / 派生色兜底，含 banner 加载失败）；
 * hover 封面中央浮出「更换封面」（Notion 式，上传流程由调用方承担）。
 */

import { useState, type ReactNode } from "react";
import { ImagePlus } from "lucide-react";
import type { IArticle } from "@/types";
import { formatDate, getContentLength } from "@/utils";
import LocalImage from "@/components/LocalImage";
import { cn } from "@tau/ui";

import { coverGradientOf } from "@/utils/cover";

interface ArticleHeroProps {
  article: IArticle;
  onTitleChange: (title: string) => void;
  /** hover「更换封面」点击（文件选择与上传流程在调用方） */
  onChangeCover: () => void;
  changingCover?: boolean;
  /** 元信息行右侧操作（⋯ 菜单等） */
  actions?: ReactNode;
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
  actions,
  className,
}: ArticleHeroProps) {
  // 实时口径：编辑中即时反映（count 字段只在保存时落库，展示不走它）
  const words = getContentLength(article.content ?? []);
  // 记失败的 url 而非布尔：换封面后自动重试新图
  const [failedBanner, setFailedBanner] = useState<string>();
  const banner = article.bannerBg && article.bannerBg !== failedBanner ? article.bannerBg : "";

  return (
    <div className={cn("mx-auto mt-8 w-[720px] max-w-[calc(100%-52px)]", className)}>
      <input
        value={article.title || ""}
        onChange={event => onTitleChange(event.target.value)}
        onKeyDown={event => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        placeholder="未命名标题"
        aria-label="文章标题"
        className="rounded-tau-sm text-ink-1 placeholder:text-ink-3 w-full bg-transparent text-[27px] font-semibold leading-[1.35] tracking-[-0.01em] outline-none"
      />
      <div className="text-tau-meta text-ink-3 mt-1.5 flex items-center gap-2.5 tabular-nums">
        <span>{formatDate(article.create_time, true)} 创建</span>
        <span className="bg-ink-3 size-[3px] rounded-full opacity-60" />
        <span>{formatDate(article.update_time, true)} 编辑</span>
        <span className="bg-ink-3 size-[3px] rounded-full opacity-60" />
        <span>{words} 字</span>
        {actions && <span className="ml-auto flex items-center">{actions}</span>}
      </div>

      <div className="rounded-tau-lg group relative mt-5 aspect-[21/9] w-full overflow-hidden">
        {banner ? (
          <LocalImage
            url={banner}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: objectPositionOf(article.bannerPosition) }}
            onLoadError={() => setFailedBanner(banner)}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ backgroundImage: coverGradientOf(article.id) }}
          />
        )}

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
      </div>
    </div>
  );
}
