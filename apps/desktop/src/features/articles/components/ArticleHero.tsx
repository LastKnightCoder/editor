/**
 * 文章 hero（mockups/article-detail/plan-sheet.html 方案 C「内衬留边」）：
 * 封面在纸顶，四周离纸边 10px、圆角与纸同心；页头（标题行内编辑 · 元信息行 +
 * 右侧 actions 槽位，如 ⋯ 菜单）落在封面下方的 720 版心。
 * 无封面（或 banner 加载失败）不画派生色色带，页头顶格，hover 页头浮出「添加封面」；
 * 有封面时 hover 封面中央浮出「更换封面」（Notion 式，上传流程由调用方承担）。
 */

import { useState, type ReactNode } from "react";
import { ImagePlus } from "lucide-react";
import type { IArticle } from "@/types";
import { formatDate, getContentLength } from "@/utils";
import LocalImage from "@/components/LocalImage";
import { cn } from "@tau/ui";

interface ArticleHeroProps {
  article: IArticle;
  onTitleChange: (title: string) => void;
  /** hover「更换封面」点击（文件选择与上传流程在调用方） */
  onChangeCover: () => void;
  changingCover?: boolean;
  /** 元信息行末尾的附加信息（如关联计数） */
  extraMeta?: ReactNode;
  /** 元信息行右侧操作（⋯ 菜单等） */
  actions?: ReactNode;
  className?: string;
}

/** 元信息里跟在前一项后的一项：分隔点随项一起让位 */
function MetaItem({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="bg-ink-3 size-[3px] rounded-full opacity-60" />
      {children}
    </span>
  );
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
  extraMeta,
  actions,
  className,
}: ArticleHeroProps) {
  // 实时口径：编辑中即时反映（count 字段只在保存时落库，展示不走它）
  const words = getContentLength(article.content ?? []);
  // 记失败的 url 而非布尔：换封面后自动重试新图
  const [failedBanner, setFailedBanner] = useState<string>();
  const banner = article.bannerBg && article.bannerBg !== failedBanner ? article.bannerBg : "";

  return (
    <div className={cn("group/hero", className)}>
      {/* 封面四周 10px：右侧 = 3px 间距 + 4px 滚动条 + 3px 透明边（滚动区覆盖为 3px），滚动条居中于右留白 */}
      {banner && (
        <div className="group/cover relative ml-2.5 mr-[3px] mt-2.5 h-[clamp(200px,20vw,300px)] overflow-hidden rounded-[calc(var(--radius-tau-lg)-6px)]">
          <LocalImage
            url={banner}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: objectPositionOf(article.bannerPosition) }}
            onLoadError={() => setFailedBanner(banner)}
          />
          {/* hover 封面中央浮出（Notion 式），封面更换中不重复触发 */}
          <button
            type="button"
            onClick={onChangeCover}
            disabled={changingCover}
            title="更换封面"
            className="ease-tau-out absolute left-1/2 top-1/2 flex h-7 -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full bg-[rgba(26,19,12,0.55)] px-3.5 text-[11.5px] text-[rgba(255,248,239,0.92)] opacity-0 backdrop-blur-[6px] transition-opacity duration-150 group-hover/cover:opacity-100"
          >
            <ImagePlus className="size-[13px]" strokeWidth={1.75} />
            {changingCover ? "上传中…" : "更换封面"}
          </button>
        </div>
      )}

      <div className={cn("mx-auto w-[720px] max-w-[calc(100%-52px)]", banner ? "mt-7" : "mt-3")}>
        {/* 无封面：页头上方留一行，hover 页头浮出「添加封面」 */}
        {!banner && (
          <button
            type="button"
            onClick={onChangeCover}
            disabled={changingCover}
            className={cn(
              "text-ink-3 hover:bg-hover hover:text-ink-1 rounded-tau-sm ease-tau-out -ml-1.5 mb-1.5 flex h-7 items-center gap-1.5 px-1.5 text-[12px] opacity-0 transition-[opacity,background-color,color] duration-150 focus-visible:opacity-100 group-hover/hero:opacity-100",
              changingCover && "opacity-100"
            )}
          >
            <ImagePlus className="size-[14px]" strokeWidth={1.75} />
            {changingCover ? "上传中…" : "添加封面"}
          </button>
        )}
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
        {/* 元信息行恒为一行：操作（extraMeta + actions）不换行不收缩、⋯ 靠右；信息组固定一行高、可换行并裁掉溢出，
            放不下的项落到看不见的第二行——按顺序先让出创建时间、再让字数，编辑时间最后（悬停可见创建时间） */}
        <div className="text-tau-meta text-ink-3 mt-1.5 flex items-center gap-2.5 whitespace-nowrap tabular-nums">
          <span className="flex h-[22px] min-w-0 shrink flex-wrap items-center gap-x-2.5 overflow-hidden leading-[22px]">
            <span title={`${formatDate(article.create_time, true)} 创建`}>
              {formatDate(article.update_time, true)} 编辑
            </span>
            <MetaItem>{words} 字</MetaItem>
            <MetaItem>{formatDate(article.create_time, true)} 创建</MetaItem>
          </span>
          <span className="flex flex-[1_0_auto] items-center gap-2.5">
            {extraMeta}
            {actions && <span className="ml-auto flex items-center">{actions}</span>}
          </span>
        </div>
      </div>
    </div>
  );
}
