/**
 * 左侧标签树面板：面板撑满可用高度、树内容面板内滚动。顶层标签全量显示
 * （不截断），展开/收起只由每行的 caret 控制（点击标签名仅切换筛选，不联动
 * 展开）；分类筛选由顶部 chips 承担，面板只承载标签树。`a/b` 前缀过滤与旧版
 * 同口径，计数含后代。
 */

import { ChevronRight, Tags } from "lucide-react";
import { useState } from "react";
import { useEdgeFade } from "@tau/ui/hooks";
import { cn } from "@tau/ui/cn";
import type { CardTagNode } from "../types";

export interface CardTreePanelProps {
  tree: CardTagNode[];
  tag: string;
  onSelectTag(tag: string): void;
}

export function CardTreePanel({ tree, tag, onSelectTag }: CardTreePanelProps) {
  /* 边缘渐隐：callback ref 接 useEdgeFade，按滚动状态收放（顶部滚离才显形） */
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl);

  /* 树由视图层派生一次（状态栏读数共用），此处只渲染 */
  const countGroups = (nodes: CardTagNode[]): number =>
    nodes.reduce((sum, node) => sum + 1 + countGroups(node.children), 0);
  const topTagCount = countGroups(tree);

  return (
    <aside className="bg-surface shadow-card sticky top-0 flex h-full max-h-full w-[236px] flex-none flex-col overflow-hidden rounded-[var(--tau-radius-lg)] p-2">
      <div className="text-ink-3 flex items-center gap-2 px-2 pb-1 pt-0.5 text-[11.5px]">
        <Tags className="size-[13px]" strokeWidth={1.75} />
        标签
        <span className="flex-1" />
        <span className="tabular-nums">{topTagCount} 组</span>
      </div>

      {/* -mr/pr 借位（同 Sidebar 协议）：滚动条右移 4px，与数字列拉开且不贴面板缘；
          pt-1 与底 pb-1 对称留白，避免首末行贴容器缘 */}
      <div
        ref={setScrollEl}
        className="edge-fade-scroll -mr-[4px] min-h-0 flex-1 overflow-y-auto py-1 pr-[4px]"
      >
        {tree.map(node => (
          <TagNode key={node.path} node={node} activeTag={tag} onSelectTag={onSelectTag} />
        ))}
        {tree.length === 0 && <p className="text-ink-3 px-2 py-3 text-[12px]">暂无标签</p>}
      </div>
    </aside>
  );
}

function TagNode({
  node,
  activeTag,
  onSelectTag,
}: {
  node: CardTagNode;
  activeTag: string;
  onSelectTag(tag: string): void;
}) {
  /* 展开/收起只由 caret 控制（点击标签名仅切换筛选，不联动）；
     挂载时当前选中落在本子树内则初始展开，保证恢复的选中项可见（之后仍可手动收起） */
  const [expanded, setExpanded] = useState(
    () => activeTag === node.path || activeTag.startsWith(node.path + "/")
  );
  const isActive = activeTag === node.path;
  const hasKids = node.children.length > 0;
  return (
    <div className="min-w-0">
      {/* caret 与选中是兄弟按钮（交互元素禁止嵌套）；无子级时 caret 隐形占位保持缩进 */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label={expanded ? "收起" : "展开"}
          disabled={!hasKids}
          onClick={() => setExpanded(value => !value)}
          className="text-ink-3 enabled:hover:bg-hover grid size-[26px] shrink-0 place-items-center rounded-[7px] disabled:invisible"
        >
          <ChevronRight
            className={cn("size-[14px] transition-transform duration-150", expanded && "rotate-90")}
            strokeWidth={1.75}
          />
        </button>
        <button
          type="button"
          onClick={() => onSelectTag(isActive ? "" : node.path)}
          className={cn(
            "flex h-[29px] min-w-0 flex-1 items-center gap-1.5 rounded-[8px] px-1.5 text-left text-[12.5px] transition-[background,color] duration-150",
            isActive
              ? "bg-selected text-ink-1 font-medium"
              : "text-ink-2 hover:bg-hover hover:text-ink-1"
          )}
        >
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          <span className="text-ink-3 text-[11px] tabular-nums">{node.count}</span>
        </button>
      </div>
      {hasKids && expanded && (
        <div className="border-line-1 ml-[13px] border-l pl-1">
          {node.children.map(child => (
            <TagNode
              key={child.path}
              node={child}
              activeTag={activeTag}
              onSelectTag={onSelectTag}
            />
          ))}
        </div>
      )}
    </div>
  );
}
