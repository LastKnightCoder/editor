/**
 * 文章卡片：月刊网格竖卡（封面在上 + 内容在下；featured 横卡形态经实机
 * 否决移除——大摘要也填不满横向空间，见 DECISIONS.md D-015 追记）。
 * 封面三态：bannerBg → 本地图；无 banner → id 派生色渐变叠首段文字（同篇同色、
 * 相邻错色，2026-09-19 裁决，mockups/articles/plan-a3-journal.html）；无摘录 →
 * 派生色纯色块。banner 加载失败按「无 banner」处理（不露裂图）。派生色板是设计定稿的数据色（与热力图色阶同性质），不进主题词表。
 */

import { Star } from "lucide-react";
import LocalImage from "@/components/LocalImage";
import { cn } from "@tau/ui";
import { articleExcerpt } from "../queries";
import { coverGradientOf } from "@/utils/cover";
import type { ArticlePageItem } from "@/types";
import { ArticleItemOps, type ArticleItemActions } from "../components/ArticleItemOps";
import { useArticleBanner } from "../components/useArticleBanner";

/** 文字封面的前景（粉彩底上的定稿对比色，出处同上） */
const TEXT_ON_COVER = "rgba(67,57,44,0.82)";
const QUOTE_ON_COVER = "rgba(255,248,239,0.6)";

export interface ArticleCardProps extends ArticleItemActions {
  article: ArticlePageItem;
}

export function ArticleCard(props: ArticleCardProps) {
  const { article } = props;
  const excerpt = articleExcerpt(article.excerpt);
  const gradient = coverGradientOf(article.id);
  const { banner, onBannerError } = useArticleBanner(article);

  return (
    <article
      tabIndex={0}
      onClick={() => props.onOpen(article)}
      className={cn(
        "bg-surface border-line-1 ease-tau-out group relative flex cursor-pointer flex-col overflow-hidden rounded-[var(--tau-radius-md)] border",
        // 落在文章页那张纸上：细描边分隔（plan-sheet 方案 B），纸上再叠阴影卡会糊成一片。
        // hover 无位移（D-013「反馈是光的」）：translateY 上浮会在卡片下缘制造 hover 进出循环。
        // 反馈 = lift 轻抬阴影 + 描边隐去（同 Skill / 项目页卡片）
        "hover:shadow-lift transition-[box-shadow,border-color] duration-200 hover:border-transparent"
      )}
    >
      {/* 封面 */}
      <div className="relative aspect-[13/8] w-full overflow-hidden">
        {banner ? (
          <LocalImage
            url={banner}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: article.bannerPosition === "top" ? "top" : "center" }}
            onLoadError={onBannerError}
          />
        ) : excerpt ? (
          <div
            className="absolute inset-0 flex items-end px-[15px] pb-[13px] pt-[26px]"
            style={{ backgroundImage: gradient }}
          >
            <span
              aria-hidden
              className="absolute left-[10px] top-[2px] font-serif text-[34px] font-bold leading-none"
              style={{ color: QUOTE_ON_COVER }}
            >
              “
            </span>
            <p
              className="line-clamp-3 text-[12.5px] leading-[1.7]"
              style={{ color: TEXT_ON_COVER }}
            >
              {excerpt}
            </p>
          </div>
        ) : (
          <div className="absolute inset-0" style={{ backgroundImage: gradient }} />
        )}
        {article.isTop && (
          <span className="bg-surface-hover text-accent absolute left-2.5 top-2.5 grid size-[22px] place-items-center rounded-[8px]">
            <Star className="fill-accent size-[13px]" strokeWidth={1.75} />
          </span>
        )}
        <ArticleItemOps
          article={article}
          actions={props}
          className="absolute right-2 top-2 z-[1]"
          buttonClassName="bg-surface-hover shadow-card enabled:hover:bg-surface-hover"
        />
      </div>

      {/* 主体 */}
      <div className="flex min-w-0 flex-1 flex-col px-3.5 pb-[11px] pt-3">
        <h3 className="text-ink-1 line-clamp-2 text-[14.5px] font-semibold leading-[1.45] tracking-[-0.005em]">
          {article.title || `文章 #${article.id}`}
        </h3>
        {excerpt && (
          <p className="text-ink-2 mt-[5px] line-clamp-2 text-[12.5px] leading-[1.65]">{excerpt}</p>
        )}
        {article.tags.length > 0 && (
          <div className="mt-[9px] flex flex-wrap gap-[5px]">
            {article.tags.map(tag => (
              <span
                key={tag}
                className="bg-hover text-ink-2 whitespace-nowrap rounded-[5px] px-[7px] py-px text-[11px]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <p className="text-ink-3 mt-auto flex items-center gap-2 pt-[9px] text-[11px] tabular-nums">
          <span>{formatMonthDay(article.updateTime)}</span>
          <span className="bg-ink-3 size-[2.5px] rounded-full opacity-60" />
          <span>{formatWords(article.words)} 字</span>
        </p>
      </div>
    </article>
  );
}

/* ---------- 展示格式化 ---------- */

function formatMonthDay(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatWords(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万`;
  return n.toLocaleString("zh-CN");
}
