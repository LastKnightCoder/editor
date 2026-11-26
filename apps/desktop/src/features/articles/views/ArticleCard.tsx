/**
 * 文章卡片：月刊网格竖卡（封面在上 + 内容在下；featured 横卡形态经实机
 * 否决移除——大摘要也填不满横向空间）。
 * 封面三态：bannerBg → 本地图；无 banner → id 派生色渐变叠首段文字（同篇同色、
 * 相邻错色）；无摘录 →
 * 派生色纯色块。banner 加载失败按「无 banner」处理（不露裂图）。派生色板是数据色（与热力图色阶同性质），不进主题词表。
 */

import { useArticlesI18n } from "../i18n";
import { Star } from "lucide-react";
import LocalImage from "@/components/LocalImage";
import { cn } from "@tau/ui";
import { articleExcerpt } from "../queries";
import { coverGradientOf } from "@/utils/cover";
import type { ArticlePageItem } from "@/types";
import { ArticleItemOps, type ArticleItemActions } from "../components/ArticleItemOps";
import { useArticleBanner } from "../components/useArticleBanner";
import { formatListDate, formatCompactCount } from "@/features/shared/list/format";
import { articleMorphKey } from "../morph";

/** 文字封面的前景（粉彩底上的对比色，出处同上） */
const TEXT_ON_COVER = "rgba(67,57,44,0.82)";
const QUOTE_ON_COVER = "rgba(255,248,239,0.6)";

export interface ArticleCardProps extends ArticleItemActions {
  article: ArticlePageItem;
}

export function ArticleCard(props: ArticleCardProps) {
  const { t, locale } = useArticlesI18n();
  const { article } = props;
  const excerpt = articleExcerpt(article.excerpt);
  const gradient = coverGradientOf(article.id);
  const { banner, onBannerError } = useArticleBanner(article);

  return (
    <article
      tabIndex={0}
      data-morph-key={articleMorphKey(article.id)}
      onClick={() => props.onOpen(article)}
      className={cn(
        "bg-surface border-line-1 ease-tau-out group relative flex cursor-pointer flex-col overflow-hidden rounded-[var(--tau-radius-md)] border",
        // 落在文章页那张纸上：细描边分隔，纸上再叠阴影卡会糊成一片。
        // hover 无位移（「反馈是光的」）：translateY 上浮会在卡片下缘制造 hover 进出循环。
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
            className="absolute inset-0 flex items-end px-[15px] pt-[26px] pb-[13px]"
            style={{ backgroundImage: gradient }}
          >
            <span
              aria-hidden
              className="absolute top-[2px] left-[10px] font-serif text-[34px] leading-none font-bold"
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
          <span className="bg-surface-hover text-accent absolute top-2.5 left-2.5 grid size-[22px] place-items-center rounded-[8px]">
            <Star className="fill-accent size-[13px]" strokeWidth={1.75} />
          </span>
        )}
        <ArticleItemOps
          article={article}
          actions={props}
          className="absolute top-2 right-2 z-[1]"
          buttonClassName="bg-surface-hover shadow-card enabled:hover:bg-surface-hover"
        />
      </div>

      {/* 主体 */}
      <div className="flex min-w-0 flex-1 flex-col px-3.5 pt-3 pb-[11px]">
        <h3 className="text-ink-1 line-clamp-2 text-[14.5px] leading-[1.45] font-semibold tracking-[-0.005em]">
          {article.title || t("fallback", { id: article.id })}
        </h3>
        {excerpt && (
          <p className="text-ink-2 mt-[5px] line-clamp-2 text-[12.5px] leading-[1.65]">{excerpt}</p>
        )}
        {article.tags.length > 0 && (
          <div className="mt-[9px] flex flex-wrap gap-[5px]">
            {article.tags.map(tag => (
              <span
                key={tag}
                className="bg-hover text-ink-2 rounded-[5px] px-[7px] py-px text-[11px] whitespace-nowrap"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <p className="text-ink-3 mt-auto flex items-center gap-2 pt-[9px] text-[11px] tabular-nums">
          <span>{formatListDate(article.updateTime, locale, false)}</span>
          <span className="bg-ink-3 size-[2.5px] rounded-full opacity-60" />
          <span>
            {t("meta.words", {
              count: article.words,
              amount: formatCompactCount(article.words, locale),
            })}
          </span>
        </p>
      </div>
    </article>
  );
}
