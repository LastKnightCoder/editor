/**
 * 文章列表排布：行式平铺，点列头排序（字数 / 更新 / 创建，置顶始终在前，排序下推主进程）。
 *
 * 行 = 缩略封面 + 标题 + 一行摘要 | 标签 | 字数 | 更新 | 创建 | 悬停操作（置顶 + ⋯）。
 * 缩略封面与网格卡同源：有 banner 用图，没有用 id 派生渐变。列头在滚动容器内吸顶；
 * 条目随无限滚动分页追加，量级有限，不做虚拟化。
 */

import { Star } from "lucide-react";
import LocalImage from "@/components/LocalImage";
import { cn } from "@tau/ui";
import type { ArticlePageItem, ArticlePageSort } from "@/types";
import { coverGradientOf } from "@/utils/cover";
import { ListTags, SortHeader } from "@/features/shared/list/ListControls";
import { cockpitRelativeTime } from "@/features/shared/cockpit/text";
import { formatDate } from "@/features/shared/cockpit/model";
import { articleExcerpt } from "../queries";
import { formatWords } from "../views/ArticleCard";
import { useArticleBanner } from "./useArticleBanner";
import { ArticleItemOps, type ArticleItemActions } from "./ArticleItemOps";

const COLS =
  "grid grid-cols-[minmax(260px,1fr)_minmax(120px,200px)_64px_80px_96px_56px] items-center gap-4";

export function ArticleListRows({
  items,
  sort,
  onSortChange,
  actions,
}: {
  items: ArticlePageItem[];
  sort: ArticlePageSort;
  onSortChange(sort: ArticlePageSort): void;
  actions: ArticleItemActions;
}) {
  const head = (key: ArticlePageSort, label: string, className?: string) => (
    <SortHeader
      label={label}
      active={sort === key}
      onSort={() => onSortChange(key)}
      className={className}
    />
  );
  return (
    <div className="-mx-3">
      <div
        className={cn(
          COLS,
          "bg-surface text-tau-sm text-ink-3 sticky top-0 z-[2] h-8 px-3 shadow-[0_1px_0_var(--tau-line-2)]"
        )}
      >
        <span>标题</span>
        <span>标签</span>
        {head("words", "字数", "justify-self-end")}
        {head("updated", "更新")}
        {head("created", "创建")}
        <span />
      </div>
      {items.map(article => (
        <ArticleListRow key={article.id} article={article} actions={actions} />
      ))}
    </div>
  );
}

function ArticleListRow({
  article,
  actions,
}: {
  article: ArticlePageItem;
  actions: ArticleItemActions;
}) {
  const excerpt = articleExcerpt(article.excerpt);
  const { banner, onBannerError } = useArticleBanner(article);
  const cell = "text-tau-sm text-ink-2 truncate tabular-nums";
  return (
    <div
      tabIndex={0}
      onClick={() => actions.onOpen(article)}
      onKeyDown={e => {
        if (e.key === "Enter" && e.target === e.currentTarget) actions.onOpen(article);
      }}
      className={cn(
        COLS,
        "hover:bg-hover group h-[60px] cursor-pointer rounded-[var(--tau-radius-md)] px-3 outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="relative h-9 w-[52px] shrink-0 overflow-hidden rounded-[7px]"
          style={{ backgroundImage: coverGradientOf(article.id) }}
        >
          {banner && (
            <LocalImage
              url={banner}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: article.bannerPosition === "top" ? "top" : "center" }}
              onLoadError={onBannerError}
            />
          )}
        </span>
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-medium">
            {article.isTop && (
              <Star
                className="text-accent fill-accent size-[13px] shrink-0"
                strokeWidth={1.75}
                aria-label="已置顶"
              />
            )}
            <span className="truncate">{article.title || `文章 #${article.id}`}</span>
          </p>
          <p className="text-ink-3 truncate text-[11.5px]">{excerpt || "还没有正文"}</p>
        </div>
      </div>
      <ListTags tags={article.tags} />
      <span className={cn(cell, "text-right", !article.words && "text-ink-3")}>
        {article.words ? formatWords(article.words) : "—"}
      </span>
      <span className={cell}>{cockpitRelativeTime(article.updateTime)}</span>
      <span className={cell}>{formatDate(article.createTime)}</span>
      <ArticleItemOps article={article} actions={actions} className="justify-end" />
    </div>
  );
}
