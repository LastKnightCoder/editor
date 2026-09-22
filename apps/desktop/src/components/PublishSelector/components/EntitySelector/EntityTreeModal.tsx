import { memo, useState, useMemo, useCallback, useEffect } from "react";
import clsx from "clsx";
import { Dialog, Button, Spinner } from "@tau/ui";
import { Editor } from "@tau/editor/src";
import { FileText, Folder } from "lucide-react";
import { Project } from "@/types/project";
import { IDocument } from "@/types/document";
import { DocTreeNode, EntityScope } from "../../types";
import { collectDocNodeIds, findDocTreeNode } from "../../utils";
import { SelectionCheckbox } from "../SelectionCheckbox";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";

interface EntityTreeModalProps {
  open: boolean;
  loading: boolean;
  type: "project" | "document";
  entity: Project | IDocument;
  nodes: DocTreeNode[];
  currentScope?: EntityScope;
  onCancel: () => void;
  onConfirm: (selectedIds: Set<number>) => void;
}

export const EntityTreeModal = memo<EntityTreeModalProps>(
  ({ open, loading, type, entity, nodes, currentScope, onCancel, onConfirm }) => {
    const dynamicExtensions = useDynamicExtensionsStore(state => state.extensions);
    const typeLabel = type === "project" ? "项目" : "知识库";

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
      setActiveNodeId(prev => (prev === nodeId ? null : nodeId));
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

    return (
      <Dialog
        open={open}
        onOpenChange={next => {
          if (!next) onCancel();
        }}
        title={entity.title || `${typeLabel} #${entity.id}`}
        subtitle={`已选择 ${selectedIds.size} / ${totalIds.length} 篇内容`}
        width={1080}
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button variant="secondary" size="sm" onClick={handleSelectAll}>
                {allSelected ? "取消全选" : "全选"}
              </Button>
              <span className="text-tau-tiny text-ink-3">共 {totalIds.length} 篇可发布文档</span>
            </div>
            <div className="flex gap-2">
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
            </div>
          </div>
        }
      >
        <div className="flex flex-1 overflow-hidden" style={{ height: "65vh", maxHeight: "65vh" }}>
          {/* 左侧：文档树（窄） */}
          <div className="border-line-1 flex w-64 shrink-0 flex-col border-r">
            <div className="border-line-1 text-ink-1 flex shrink-0 items-center justify-between border-b px-4 py-3 text-[13px] font-medium">
              <span>文档结构</span>
              <span className="text-tau-tiny text-ink-3 tabular-nums">
                {selectedIds.size}/{totalIds.length}
              </span>
            </div>
            {loading ? (
              <div className="flex flex-1 items-center justify-center">
                <Spinner className="size-7" />
              </div>
            ) : nodes.length === 0 ? (
              <div className="text-ink-3 flex flex-1 items-center justify-center text-[13px]">
                暂无可发布的文档
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto py-2">
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
              </div>
            )}
          </div>

          {/* 右侧：预览面板（宽） */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {previewNode ? (
              <>
                <div className="border-line-1 flex shrink-0 items-center gap-3 border-b px-6 py-3">
                  <span
                    className={clsx(
                      "h-2 w-2 shrink-0 rounded-full",
                      selectedIds.has(previewNode.id) ? "bg-accent" : "bg-sunken"
                    )}
                  />
                  <h3 className="text-tau-body text-ink-1 truncate font-medium">
                    {previewNode.title}
                  </h3>
                  {!previewNode.hasContent && (
                    <span className="bg-group text-ink-2 shrink-0 rounded-full px-2 py-0.5 text-[11px]">
                      文件夹
                    </span>
                  )}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                  {previewNode.hasContent ? (
                    <Editor
                      key={previewNode.id}
                      initValue={previewNode.content}
                      readonly
                      extensions={dynamicExtensions}
                      className="text-tau-body text-ink-1"
                    />
                  ) : (
                    <div className="text-ink-3 flex h-full items-center justify-center text-[13px]">
                      此节点为文件夹，无内容可预览
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-ink-3 flex flex-1 flex-col items-center justify-center gap-3">
                <FileText size={40} strokeWidth={1.25} className="opacity-40" />
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
          "mx-1 flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 transition-colors",
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
