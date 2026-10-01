import { useMemo, useState } from "react";
import { Checkbox, cn } from "@tau/ui";
import { ChevronRight, FileX2 } from "lucide-react";
import { EProjectItemType } from "@/types";
import type { BatchExportTreeNode } from "@/utils/batch-export";

/** 子树内全部可导出条目的 id（与 collectExportableIds 同集） */
const collectSubtreeExportableIds = (node: BatchExportTreeNode): number[] => [
  ...(node.exportable ? [node.id] : []),
  ...node.children.flatMap(collectSubtreeExportableIds),
];

const ITEM_TYPE_LABEL: Record<EProjectItemType, string> = {
  [EProjectItemType.Document]: "文档",
  [EProjectItemType.WhiteBoard]: "白板",
  [EProjectItemType.VideoNote]: "视频笔记",
  [EProjectItemType.WebView]: "网页",
  [EProjectItemType.TableView]: "数据表",
  [EProjectItemType.Pdf]: "PDF",
};

const UNSUPPORTED_HINT = "该类型暂不支持整体导出";

const getNodeTag = (node: BatchExportTreeNode) => {
  if (!node.exportable) return { label: ITEM_TYPE_LABEL[node.itemType], hint: UNSUPPORTED_HINT };
  if (node.empty) return { label: "空白", hint: "没有正文，导出时只保留标题" };
  return null;
};

interface ExportCheckTreeProps {
  nodes: BatchExportTreeNode[];
  checkedKeys: number[];
  onCheckedKeysChange: (keys: number[]) => void;
}

/**
 * 导出内容勾选树：checkedKeys 是被勾选的可导出条目 id（父 + 子）。
 * 勾选任意节点都级联到其子树内的可导出条目；只有文档可导出，空白文档与非文档条目
 * 以短标签标识，非文档条目子树内没有文档时禁勾。
 */
const ExportCheckTree = ({ nodes, checkedKeys, onCheckedKeysChange }: ExportCheckTreeProps) => {
  const checkedSet = useMemo(() => new Set(checkedKeys), [checkedKeys]);
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());

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

  const renderNode = (node: BatchExportTreeNode, level: number) => {
    const subtreeIds = collectSubtreeExportableIds(node);
    const hit = subtreeIds.filter(id => checkedSet.has(id)).length;
    const selectable = subtreeIds.length > 0;
    const checked = selectable && hit === subtreeIds.length;
    const hasChildren = node.children.length > 0;
    const open = hasChildren && !collapsed.has(node.id);
    const tag = getNodeTag(node);

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
              className="bg-hover text-ink-3 text-tau-tiny shrink-0 rounded-full px-[7px]"
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
};

/** 整棵树都没有文档时的空态：说明原因，而不只是显示 0 / 0 */
export const ExportTreeEmpty = () => (
  <div className="flex flex-col items-center gap-1.5 px-5 py-9 text-center">
    <span className="bg-hover text-ink-3 rounded-tau-md mb-1 grid size-10 place-items-center">
      <FileX2 className="size-5" />
    </span>
    <b className="text-ink-1 text-tau-body-lg font-semibold">这个项目里没有文档</b>
    <p className="text-ink-3 text-tau-meta max-w-[30ch]">
      PDF、白板、视频笔记、网页和数据表暂不支持整体导出。
    </p>
  </div>
);

export default ExportCheckTree;
