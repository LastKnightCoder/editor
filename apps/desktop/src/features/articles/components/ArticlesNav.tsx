/**
 * 侧栏「文章」入口的子项（待办项目 / 项目类型同款侧栏嵌套）：各标签（按篇数排序）。
 * 文章页在栈顶时于入口下方展开，点击经页面参数 id（标签名）收窄到该标签，再点当前项回到全部。
 * 标签可能很多：列表限高约 8 行，超出在框内滚动（FadeScroll 上下渐隐），不放筛选框——
 * 找文章走文章页右上角的标题搜索。页内因此不放标签 pills。
 */

import type { ReactNode } from "react";
import { cn } from "@tau/ui";
import { FadeScroll } from "@/components/FadeScroll";
import { useArticleTagCounts } from "../queries";

export function ArticlesNavTags({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const { tags } = useArticleTagCounts();
  if (!tags.length) return null;

  return (
    // -mr-1.5：FadeScroll 右侧 6px 透明边吃进侧栏右内边距；内层 pr-1.5 让行与滚动条之间留出间隙
    <FadeScroll className="-mr-1.5 mb-1 mt-0.5 max-h-[236px]">
      <div className="space-y-px pr-1.5" role="group" aria-label="文章标签">
        {tags.map(({ tag, count }) => {
          const active = selectedId === tag;
          return (
            <NavChild
              key={tag}
              active={active}
              label={tag}
              count={count}
              glyph={
                <span className={cn("text-[12px]", active ? "text-accent-text" : "text-ink-3")}>
                  #
                </span>
              }
              title={active ? "再点一次回到全部" : `只看「${tag}」`}
              onClick={() => onSelect(active ? "" : tag)}
            />
          );
        })}
      </div>
    </FadeScroll>
  );
}

function NavChild({
  active,
  label,
  count = 0,
  glyph,
  title,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  glyph: ReactNode;
  title?: string;
  onClick: () => void;
}) {
  return (
    // 让出父项图标列（按 body 字号折算）放在按钮外：高亮只盖色点起的一段，色点落在父项文字列
    <div className="flex gap-2.5">
      <span aria-hidden className="text-tau-body w-[1.06em] shrink-0" />
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        title={title}
        className={cn(
          "text-tau-meta ease-tau-out flex h-[calc(1.5em+10px)] min-w-0 flex-1 items-center gap-2.5 rounded-[9px] px-2.5 text-left transition-[background,color] duration-[160ms]",
          active
            ? "bg-selected text-ink-1 font-medium"
            : "text-ink-2 hover:bg-hover hover:text-ink-1"
        )}
      >
        <span className="grid w-[13px] shrink-0 place-items-center">{glyph}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count > 0 && (
          <span className="text-tau-tiny text-ink-3 font-normal tabular-nums">{count}</span>
        )}
      </button>
    </div>
  );
}
