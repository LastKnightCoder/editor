/**
 * 侧栏「文章」入口的子项（待办项目 / 项目类型同款侧栏嵌套）：各标签（按篇数排序）。
 * 文章页在栈顶时于入口下方展开，点击经页面参数 id（标签名）收窄到该标签，再点当前项回到全部。
 * 标签可能很多：列表限高约 8 行，超出在框内滚动（FadeScroll 上下渐隐），不放筛选框——
 * 找文章走文章页右上角的标题搜索。页内因此不放标签 pills。
 */

import type { ReactNode } from "react";
import { cn } from "@tau/ui";
import { FadeScroll } from "@tau/ui";
import { TagRowCountSlot } from "@/components/AddTag/TagRowMenu";
import { useTagManage } from "@/components/AddTag/useTagManage";
import { useArticleTagCounts, useArticleTagMutations } from "../queries";

export function ArticlesNavTags({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const { tags } = useArticleTagCounts();
  const mutations = useArticleTagMutations();
  const manage = useTagManage({
    existing: tags,
    entity: "article",
    hierarchical: false,
    rename: mutations.rename,
    remove: mutations.remove,
    // 正在按改动的标签筛选时，筛选跟着走：改名换成新名字，删除回到全部
    onRenamed: (from, to) => {
      if (selectedId === from) onSelect(to);
    },
    onRemoved: tag => {
      if (selectedId === tag) onSelect("");
    },
  });
  if (!tags.length) return manage.dialogs;

  return (
    // -mr-1.5：FadeScroll 右侧 6px 透明边吃进侧栏右内边距；内层 pr-1.5 让行与滚动条之间留出间隙
    <FadeScroll className="mt-0.5 -mr-1.5 mb-1 max-h-[236px]">
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
              onRename={() => manage.startRename({ tag, count })}
              onDelete={() => manage.startDelete({ tag, count })}
            />
          );
        })}
      </div>
      {manage.dialogs}
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
  onRename,
  onDelete,
}: {
  active: boolean;
  label: string;
  count?: number;
  glyph: ReactNode;
  title?: string;
  onClick: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    // 让出父项图标列（按 body 字号折算）放在行外：高亮只盖色点起的一段，色点落在父项文字列
    <div className="flex gap-2.5">
      <span aria-hidden className="text-tau-body w-[1.06em] shrink-0" />
      {/* 标签名与 ⋯ 是兄弟按钮（交互元素禁止嵌套） */}
      <div
        className={cn(
          "group/tag text-tau-meta ease-tau-out flex h-[calc(1.5em+10px)] min-w-0 flex-1 items-center rounded-[9px] pr-1.5 transition-[background,color] duration-[160ms]",
          active
            ? "bg-selected text-ink-1 font-medium"
            : "text-ink-2 hover:bg-hover hover:text-ink-1"
        )}
      >
        <button
          type="button"
          onClick={onClick}
          aria-current={active ? "page" : undefined}
          title={title}
          className="flex h-full min-w-0 flex-1 items-center gap-2.5 pr-1 pl-2.5 text-left"
        >
          <span className="grid w-[13px] shrink-0 place-items-center">{glyph}</span>
          <span className="min-w-0 flex-1 truncate">{label}</span>
        </button>
        <TagRowCountSlot count={count} label={label} onRename={onRename} onDelete={onDelete} />
      </div>
    </div>
  );
}
