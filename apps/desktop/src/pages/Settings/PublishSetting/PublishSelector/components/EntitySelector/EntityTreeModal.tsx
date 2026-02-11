import { memo, useState, useMemo, useCallback } from "react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";
import CustomModal from "@/components/CustomModal";
import { Editor } from "@tau/editor/src";
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
  ({
    open,
    loading,
    type,
    entity,
    nodes,
    currentScope,
    onCancel,
    onConfirm,
  }) => {
    const dynamicExtensions = useDynamicExtensionsStore(
      (state) => state.extensions,
    );
    const themeColors = useThemeColors();
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

    // 当前预览的节点
    const previewNode = useMemo(() => {
      if (!activeNodeId) return null;
      return findDocTreeNode(nodes, activeNodeId) || null;
    }, [nodes, activeNodeId]);

    // 切换节点选中状态
    const handleToggleNode = useCallback((node: DocTreeNode) => {
      const ids = collectDocNodeIds([node]);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        const shouldSelect = ids.some((id) => !next.has(id));
        ids.forEach((id) => {
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
      setActiveNodeId((prev) => (prev === nodeId ? null : nodeId));
    }, []);

    // 全选/取消全选
    const handleSelectAll = useCallback(() => {
      setSelectedIds((prev) => {
        if (prev.size === totalIds.length) {
          return new Set();
        }
        return new Set(totalIds);
      });
    }, [totalIds]);

    const allSelected = selectedIds.size === totalIds.length;

    return (
      <CustomModal
        open={open}
        onCancel={onCancel}
        width="90vw"
        bodyClassName="!p-0"
        contentClassName="flex flex-col"
        title={entity.title || `${typeLabel} #${entity.id}`}
        subtitle={`已选择 ${selectedIds.size} / ${totalIds.length} 篇内容`}
        footer={
          <div className="flex w-full items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-3">
              <button
                onClick={handleSelectAll}
                className={classNames(
                  "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                  themeColors.cardBgClass,
                  themeColors.cardBorderClass,
                  "hover:bg-gray-100 dark:hover:bg-gray-800/50",
                  themeColors.textClass,
                )}
              >
                {allSelected ? "取消全选" : "全选"}
              </button>
              <span className={themeColors.secondaryTextClass}>
                共 {totalIds.length} 篇可发布文档
              </span>
            </div>
            <div className="flex gap-2">
              <button
                className={classNames(
                  "px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors",
                  themeColors.cardBgClass,
                  themeColors.cardBorderClass,
                  "hover:bg-gray-100 dark:hover:bg-gray-800/50",
                  themeColors.textClass,
                )}
                onClick={onCancel}
              >
                取消
              </button>
              <button
                className={classNames(
                  "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  themeColors.primaryButtonClass,
                )}
                onClick={() => onConfirm(selectedIds)}
                disabled={loading}
              >
                保存
              </button>
            </div>
          </div>
        }
      >
        <div
          className="flex flex-1 overflow-hidden"
          style={{ height: "65vh", maxHeight: "65vh" }}
        >
          {/* 左侧：文档树（窄） */}
          <div
            className={classNames(
              "w-64 flex-shrink-0 border-r flex flex-col",
              themeColors.cardBorderClass,
            )}
          >
            <div
              className={classNames(
                "px-4 py-3 border-b text-sm font-medium flex-shrink-0 flex items-center justify-between",
                themeColors.cardBorderClass,
                themeColors.textClass,
              )}
            >
              <span>文档结构</span>
              <span
                className={classNames(
                  "text-xs",
                  themeColors.secondaryTextClass,
                )}
              >
                {selectedIds.size}/{totalIds.length}
              </span>
            </div>
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <div
                  className={classNames(
                    "h-8 w-8 animate-spin rounded-full border-2",
                    themeColors.cardBorderClass,
                    "border-t-current",
                    themeColors.activeTextClass,
                  )}
                />
              </div>
            ) : nodes.length === 0 ? (
              <div
                className={classNames(
                  "flex-1 flex items-center justify-center text-sm",
                  themeColors.secondaryTextClass,
                )}
              >
                暂无可发布的文档
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto py-2 min-h-0">
                {nodes.map((node) => (
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
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {previewNode ? (
              <>
                {/* 预览标题栏 */}
                <div
                  className={classNames(
                    "px-6 py-3 border-b flex-shrink-0 flex items-center gap-3",
                    themeColors.cardBorderClass,
                  )}
                >
                  <div
                    className={classNames(
                      "w-2 h-2 rounded-full flex-shrink-0",
                      selectedIds.has(previewNode.id)
                        ? "bg-green-500"
                        : "bg-gray-300 dark:bg-gray-600",
                    )}
                  />
                  <h3
                    className={classNames(
                      "text-base font-medium truncate",
                      themeColors.textClass,
                    )}
                  >
                    {previewNode.title}
                  </h3>
                  {!previewNode.hasContent && (
                    <span
                      className={classNames(
                        "text-xs px-2 py-0.5 rounded-full flex-shrink-0",
                        themeColors.tagBgClass,
                        themeColors.secondaryTextClass,
                      )}
                    >
                      文件夹
                    </span>
                  )}
                </div>
                {/* 预览内容 */}
                <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
                  {previewNode.hasContent ? (
                    <Editor
                      key={previewNode.id}
                      initValue={previewNode.content}
                      readonly
                      extensions={dynamicExtensions}
                      className={classNames("text-sm", themeColors.textClass)}
                    />
                  ) : (
                    <div
                      className={classNames(
                        "flex items-center justify-center h-full text-sm",
                        themeColors.secondaryTextClass,
                      )}
                    >
                      此节点为文件夹，无内容可预览
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div
                className={classNames(
                  "flex-1 flex flex-col items-center justify-center gap-3",
                  themeColors.secondaryTextClass,
                )}
              >
                <svg
                  className="w-12 h-12 opacity-30"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span className="text-sm">点击左侧文档查看预览</span>
              </div>
            )}
          </div>
        </div>
      </CustomModal>
    );
  },
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
  const themeColors = useThemeColors();

  const descendantIds = useMemo(() => collectDocNodeIds([node]), [node]);
  const allSelected =
    descendantIds.length > 0 &&
    descendantIds.every((id) => selectedIds.has(id));
  const partiallySelected =
    !allSelected && descendantIds.some((id) => selectedIds.has(id));
  const isActive = activeNodeId === node.id;

  return (
    <div>
      <div
        className={classNames(
          "flex items-center gap-2 px-3 py-1.5 transition-colors cursor-pointer mx-1 rounded-md",
          isActive
            ? "bg-blue-50 dark:bg-blue-500/10"
            : "hover:bg-gray-50 dark:hover:bg-gray-800/30",
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
          className={classNames(
            "flex-1 text-sm truncate",
            isActive
              ? "text-blue-600 dark:text-blue-400 font-medium"
              : themeColors.textClass,
          )}
        >
          {node.title}
        </span>
        {!node.hasContent && node.children.length > 0 && (
          <svg
            className={classNames(
              "w-3.5 h-3.5 flex-shrink-0",
              themeColors.secondaryTextClass,
            )}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
        )}
      </div>
      {node.children.map((child) => (
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
