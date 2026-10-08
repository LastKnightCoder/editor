/**
 * 侧栏「卡片库」入口的子项（同文章页 ArticlesNav）：层级标签树（`a/b` 按段拆层，计数含后代）。
 * 卡片库在栈顶时于入口下方展开，点击经页面参数 id（标签路径）收窄，再点当前项回到全部。
 * 展开 / 收起只由行首 caret 控制（点标签名只切筛选）；叶子行首是 #。
 * 标签可能很多：列表限高约 8 行，超出在框内滚动（FadeScroll 上下渐隐）。
 */

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@tau/ui";
import { FadeScroll } from "@tau/ui";
import { useCardTagTree } from "../queries";
import type { CardTagNode } from "../types";

export function CardsNavTags({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const tree = useCardTagTree();
  if (!tree.length) return null;

  return (
    // -mr-1.5：FadeScroll 右侧 6px 透明边吃进侧栏右内边距；内层 pr-1.5 让行与滚动条之间留出间隙
    <FadeScroll className="-mr-1.5 mb-1 mt-0.5 max-h-[236px]">
      <div className="space-y-px pr-1.5" role="tree" aria-label="卡片标签">
        {tree.map(node => (
          <TagNode
            key={node.path}
            node={node}
            depth={0}
            activeTag={selectedId ?? ""}
            onSelect={onSelect}
          />
        ))}
      </div>
    </FadeScroll>
  );
}

/** 每层缩进（px）：子层 caret / # 落在父层文字起点附近 */
const INDENT = 14;

function TagNode({
  node,
  depth,
  activeTag,
  onSelect,
}: {
  node: CardTagNode;
  depth: number;
  activeTag: string;
  onSelect: (id: string) => void;
}) {
  /* 挂载时当前选中落在本子树内则初始展开，保证恢复的选中项可见（之后仍可手动收起） */
  const [expanded, setExpanded] = useState(() => activeTag.startsWith(node.path + "/"));
  const active = activeTag === node.path;
  const hasKids = node.children.length > 0;

  return (
    <div role="treeitem" aria-expanded={hasKids ? expanded : undefined} aria-selected={active}>
      {/* 让出父项图标列（按 body 字号折算）放在行外：高亮只盖 caret 起的一段 */}
      <div className="flex gap-2.5">
        <span aria-hidden className="text-tau-body w-[1.06em] shrink-0" />
        <div
          className={cn(
            "text-tau-meta ease-tau-out flex h-[calc(1.5em+10px)] min-w-0 flex-1 items-center rounded-[9px] transition-[background,color] duration-[160ms]",
            active
              ? "bg-selected text-ink-1 font-medium"
              : "text-ink-2 hover:bg-hover hover:text-ink-1"
          )}
          style={{ paddingLeft: 4 + depth * INDENT }}
        >
          {/* caret 与标签名是兄弟按钮（交互元素禁止嵌套）；叶子行首放 # 占同宽 */}
          {hasKids ? (
            <button
              type="button"
              aria-label={expanded ? "收起" : "展开"}
              onClick={() => setExpanded(value => !value)}
              className="text-ink-3 hover:text-ink-1 grid size-[21px] shrink-0 place-items-center rounded-[6px]"
            >
              <ChevronRight
                className={cn(
                  "ease-tau-out size-[13px] transition-transform duration-150",
                  expanded && "rotate-90"
                )}
                strokeWidth={1.75}
              />
            </button>
          ) : (
            <span
              aria-hidden
              className={cn(
                "grid size-[21px] shrink-0 place-items-center text-[12px]",
                active ? "text-accent-text" : "text-ink-3"
              )}
            >
              #
            </span>
          )}
          <button
            type="button"
            onClick={() => onSelect(active ? "" : node.path)}
            aria-current={active ? "page" : undefined}
            title={active ? "再点一次回到全部" : `只看「${node.path}」`}
            className="flex h-full min-w-0 flex-1 items-center gap-2.5 pl-1 pr-2.5 text-left"
          >
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
            <span className="text-tau-tiny text-ink-3 font-normal tabular-nums">{node.count}</span>
          </button>
        </div>
      </div>
      {hasKids && expanded && (
        <div className="mt-px space-y-px">
          {node.children.map(child => (
            <TagNode
              key={child.path}
              node={child}
              depth={depth + 1}
              activeTag={activeTag}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
