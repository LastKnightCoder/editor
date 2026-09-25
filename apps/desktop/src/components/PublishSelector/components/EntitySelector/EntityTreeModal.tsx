import { memo, useState, useMemo, useCallback, useEffect } from "react";
import clsx from "clsx";
import { Dialog, Button, Spinner } from "@tau/ui";
import { Editor } from "@tau/editor/src";
import { FileText, Folder } from "lucide-react";
import { Project } from "@/types/project";
import { DocTreeNode, EntityScope } from "../../types";
import { collectDocNodeIds, findDocTreeNode } from "../../utils";
import { SelectionCheckbox } from "../SelectionCheckbox";
import { SelectAllButton } from "../SearchToolbar";
import { FadeScroll } from "@/components/FadeScroll";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";

interface EntityTreeModalProps {
  open: boolean;
  loading: boolean;
  type: "project";
  entity: Project;
  nodes: DocTreeNode[];
  currentScope?: EntityScope;
  onCancel: () => void;
  onConfirm: (selectedIds: Set<number>) => void;
}

export const EntityTreeModal = memo<EntityTreeModalProps>(
  ({ open, loading, entity, nodes, currentScope, onCancel, onConfirm }) => {
    const dynamicExtensions = useDynamicExtensionsStore(state => state.extensions);
    const typeLabel = "项目";

    // 初始化选中的 ID
    const totalIds = useMemo(() => collectDocNodeIds(nodes), [nodes]);

    const [selectedIds, setSelectedIds] = useState<Set<number>>(() => {
      if (currentScope?.mode === "partial") {
        return new Set(currentScope.nodeIds);
      }
      return new Set(totalIds);
    });

    const [activeNodeId, setActiveNodeId] = useState<number | null>(null);

    useEffect(() => {
      if (!open) return;
      if (currentScope?.mode === "partial") {
        setSelectedIds(new Set(currentScope.nodeIds));
      } else {
        setSelectedIds(new Set(totalIds));
      }
      setActiveNodeId(null);
    }, [open, entity.id, currentScope, totalIds]);

    // 当前预览的节点
    const previewNode = useMemo(() => {
      if (!activeNodeId) return null;
      return findDocTreeNode(nodes, activeNodeId) || null;
    }, [nodes, activeNodeId]);

    useEffect(() => {
      if (activeNodeId === null) return;
      if (!previewNode) {
        setActiveNodeId(null);
      }
    }, [activeNodeId, previewNode]);

    // 切换节点选中状态
    const handleToggleNode = useCallback((node: DocTreeNode) => {
      const ids = collectDocNodeIds([node]);
      setSelectedIds(prev => {
        const next = new Set(prev);
        const shouldSelect = ids.some(id => !next.has(id));
        ids.forEach(id => {
          if (shouldSelect) {
            next.add(id);
          } else {
            next.delete(id);
          }
        });
        return next;
      });
    }, []);

    // 点击预览节点
    const handleClickNode = useCallback((nodeId: number) => {
      setActiveNodeId(nodeId);
    }, []);

    // 全选/取消全选
    const handleSelectAll = useCallback(() => {
      setSelectedIds(prev => {
        if (prev.size === totalIds.length) {
          return new Set();
        }
        return new Set(totalIds);
      });
    }, [totalIds]);

    const allSelected = selectedIds.size === totalIds.length;

    const selectedCount = selectedIds.size;

    return (
      <Dialog
        open={open}
        onOpenChange={next => {
          if (!next) onCancel();
        }}
        title={entity.title || `${typeLabel} #${entity.id}`}
        context={typeLabel}
        subtitle="勾选要公开的文档，点击标题预览内容"
        width={1040}
        fill
        impact={
          selectedCount === 0 && totalIds.length > 0
            ? `未勾选任何文档，保存后将不再发布此${typeLabel}`
            : `已选 ${selectedCount} / ${totalIds.length} 篇可发布文档`
        }
        impactDanger={selectedCount === 0 && totalIds.length > 0}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={onCancel}>
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={loading}
              onClick={() => onConfirm(selectedIds)}
            >
              保存
            </Button>
          </>
        }
      >
        <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)]">
          {/* 左侧：文档树——列表自身滚动，头部钉住 */}
          <div className="border-line-2 flex min-h-0 flex-col border-r">
            <div className="flex shrink-0 items-center gap-2 pb-1.5 pl-[18px] pr-2.5 pt-3">
              <span className="text-ink-3 text-[11.5px] font-medium">文档结构</span>
              <span className="font-tau-mono text-ink-3 text-[11px] tabular-nums">
                {selectedCount}/{totalIds.length}
              </span>
              {!loading && totalIds.length > 0 && (
                <span className="ml-auto">
                  <SelectAllButton allSelected={allSelected} onClick={handleSelectAll} />
                </span>
              )}
            </div>
            {loading ? (
              <div className="flex flex-1 items-center justify-center">
                <Spinner className="size-6" />
              </div>
            ) : nodes.length === 0 ? (
              <div className="text-ink-3 flex flex-1 items-center justify-center text-[13px]">
                暂无可发布的文档
              </div>
            ) : (
              <FadeScroll className="mb-3 min-h-0 flex-1 px-1.5 pb-1">
                {nodes.map(node => (
                  <DocTreeNodeItem
                    key={node.id}
                    node={node}
                    selectedIds={selectedIds}
                    onToggle={handleToggleNode}
                    onClick={handleClickNode}
                    activeNodeId={activeNodeId}
                  />
                ))}
              </FadeScroll>
            )}
          </div>

          {/* 右侧：预览——仅正文区滚动；空态/文件夹态居中不滚动 */}
          <div className="flex min-h-0 min-w-0 flex-col">
            {previewNode ? (
              <>
                <div className="border-line-2 flex shrink-0 items-center gap-2.5 border-b px-7 py-3">
                  <span
                    className={clsx(
                      "size-2 shrink-0 rounded-full",
                      selectedIds.has(previewNode.id) ? "bg-accent" : "bg-track"
                    )}
                  />
                  <h3 className="text-tau-body text-ink-1 min-w-0 truncate font-medium">
                    {previewNode.title}
                  </h3>
                  <span className="text-tau-micro text-ink-3 ml-auto shrink-0">
                    {!previewNode.hasContent
                      ? "文件夹"
                      : selectedIds.has(previewNode.id)
                        ? "将发布"
                        : "未勾选"}
                  </span>
                </div>
                {previewNode.hasContent ? (
                  <FadeScroll className="min-h-0 flex-1 px-7 pb-6 pt-4">
                    <Editor
                      key={previewNode.id}
                      initValue={previewNode.content}
                      readonly
                      extensions={dynamicExtensions}
                      className="text-tau-body text-ink-1"
                    />
                  </FadeScroll>
                ) : (
                  <div className="text-ink-3 flex flex-1 flex-col items-center justify-center gap-2.5">
                    <Folder size={32} strokeWidth={1.25} className="opacity-50" />
                    <span className="text-[13px]">
                      文件夹，包含 {collectDocNodeIds(previewNode.children).length} 篇文档
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="text-ink-3 flex flex-1 flex-col items-center justify-center gap-2.5">
                <FileText size={32} strokeWidth={1.25} className="opacity-50" />
                <span className="text-[13px]">点击左侧文档查看预览</span>
              </div>
            )}
          </div>
        </div>
      </Dialog>
    );
  }
);

EntityTreeModal.displayName = "EntityTreeModal";

// 文档树节点组件
const DocTreeNodeItem = memo<{
  node: DocTreeNode;
  selectedIds: Set<number>;
  onToggle: (node: DocTreeNode) => void;
  onClick: (id: number) => void;
  activeNodeId: number | null;
  depth?: number;
}>(({ node, selectedIds, onToggle, onClick, activeNodeId, depth = 0 }) => {
  const descendantIds = useMemo(() => collectDocNodeIds([node]), [node]);
  const allSelected = descendantIds.length > 0 && descendantIds.every(id => selectedIds.has(id));
  const partiallySelected = !allSelected && descendantIds.some(id => selectedIds.has(id));
  const isActive = activeNodeId === node.id;

  return (
    <div>
      <div
        className={clsx(
          "flex cursor-pointer items-center gap-2 rounded-[7px] py-1.5 pr-2.5 transition-colors",
          isActive ? "bg-selected" : "hover:bg-hover"
        )}
        style={{ paddingLeft: depth * 12 + 12 }}
        onClick={() => onClick(node.id)}
      >
        <SelectionCheckbox
          checked={allSelected}
          indeterminate={partiallySelected}
          onChange={() => onToggle(node)}
          size="sm"
        />
        <span
          className={clsx(
            "flex-1 truncate text-[13px]",
            isActive ? "text-ink-1 font-medium" : "text-ink-2"
          )}
        >
          {node.title}
        </span>
        {!node.hasContent && node.children.length > 0 && (
          <Folder size={13} strokeWidth={1.75} className="text-ink-3 shrink-0" />
        )}
      </div>
      {node.children.map(child => (
        <DocTreeNodeItem
          key={child.id}
          node={child}
          selectedIds={selectedIds}
          onToggle={onToggle}
          onClick={onClick}
          activeNodeId={activeNodeId}
          depth={depth + 1}
        />
      ))}
    </div>
  );
});

DocTreeNodeItem.displayName = "DocTreeNodeItem";
