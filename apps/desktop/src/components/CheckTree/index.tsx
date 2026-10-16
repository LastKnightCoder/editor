/**
 * 级联勾选树：checkedKeys 是被勾选的可选节点 id（父 + 子）。
 * 勾选任意节点都级联到其子树内的可选节点；子树内没有可选节点的分支禁勾。
 * 整体导出（项目条目）与批量导入预览（来源文件）共用。
 */

import { useMemo, useState, type ReactNode } from "react";
import { Checkbox, cn } from "@tau/ui";
import { ChevronRight } from "lucide-react";

export interface CheckTreeNode<T> {
  id: number;
  title: string;
  children: T[];
}

export interface CheckTreeTag {
  label: ReactNode;
  hint?: string;
  tone?: "warn";
}

export interface CheckTreeProps<T extends CheckTreeNode<T>> {
  nodes: T[];
  checkedKeys: number[];
  onCheckedKeysChange: (keys: number[]) => void;
  isSelectable: (node: T) => boolean;
  /** 标题右侧的短标签 */
  getTag?: (node: T) => CheckTreeTag | null;
  /** 初始折叠的节点（只在挂载时读取；大树按需传入，避免一次渲染全部叶子） */
  initiallyCollapsed?: number[];
}

const collectSubtreeIds = <T extends CheckTreeNode<T>>(
  node: T,
  isSelectable: (node: T) => boolean
): number[] => [
  ...(isSelectable(node) ? [node.id] : []),
  ...node.children.flatMap(child => collectSubtreeIds(child, isSelectable)),
];

export function CheckTree<T extends CheckTreeNode<T>>({
  nodes,
  checkedKeys,
  onCheckedKeysChange,
  isSelectable,
  getTag,
  initiallyCollapsed,
}: CheckTreeProps<T>) {
  const checkedSet = useMemo(() => new Set(checkedKeys), [checkedKeys]);
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set(initiallyCollapsed));

  const toggle = (subtreeIds: number[], next: boolean) => {
    const ids = new Set(subtreeIds);
    onCheckedKeysChange(
      next ? [...new Set([...checkedKeys, ...ids])] : checkedKeys.filter(id => !ids.has(id))
    );
  };

  const toggleCollapsed = (id: number) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const renderNode = (node: T, level: number) => {
    const subtreeIds = collectSubtreeIds(node, isSelectable);
    const hit = subtreeIds.filter(id => checkedSet.has(id)).length;
    const selectable = subtreeIds.length > 0;
    const checked = selectable && hit === subtreeIds.length;
    const hasChildren = node.children.length > 0;
    const open = hasChildren && !collapsed.has(node.id);
    const tag = getTag?.(node) ?? null;

    return (
      <div key={node.id} role="treeitem" aria-expanded={hasChildren ? open : undefined}>
        <div
          className={cn(
            "flex h-[30px] items-center gap-1.5 rounded-[7px] pr-2",
            selectable && "hover:bg-hover cursor-pointer"
          )}
          style={{ paddingLeft: 4 + level * 18 }}
          onClick={selectable ? () => toggle(subtreeIds, !checked) : undefined}
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label={open ? "折叠" : "展开"}
            className={cn(
              "text-ink-3 hover:text-ink-1 grid size-4 shrink-0 place-items-center",
              !hasChildren && "invisible"
            )}
            onClick={event => {
              event.stopPropagation();
              toggleCollapsed(node.id);
            }}
          >
            <ChevronRight
              className={cn(
                "ease-tau-out size-3 transition-transform duration-150",
                open && "rotate-90"
              )}
              strokeWidth={2.2}
            />
          </button>
          <Checkbox
            checked={checked}
            indeterminate={hit > 0 && !checked}
            disabled={!selectable}
            aria-label={node.title}
            onClick={event => event.stopPropagation()}
            onChange={event => toggle(subtreeIds, event.target.checked)}
          />
          <span
            title={node.title}
            className={cn(
              "text-tau-body min-w-0 flex-1 truncate",
              selectable && hit > 0 ? "text-ink-1" : "text-ink-3",
              level === 0 && hasChildren && "font-[550]"
            )}
          >
            {node.title}
          </span>
          {tag && (
            <span
              title={tag.hint}
              className={cn(
                "text-tau-tiny shrink-0 rounded-full px-[7px]",
                tag.tone === "warn" ? "bg-warn-soft text-warn" : "bg-hover text-ink-3"
              )}
            >
              {tag.label}
            </span>
          )}
          {selectable && hasChildren && !open && (
            <span className="text-ink-3 font-tau-mono text-tau-tiny shrink-0 tabular-nums">
              {hit}/{subtreeIds.length}
            </span>
          )}
        </div>
        {open && <div role="group">{node.children.map(child => renderNode(child, level + 1))}</div>}
      </div>
    );
  };

  return <div role="tree">{nodes.map(node => renderNode(node, 0))}</div>;
}
