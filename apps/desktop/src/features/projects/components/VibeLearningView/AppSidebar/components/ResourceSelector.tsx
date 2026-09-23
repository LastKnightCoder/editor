import { memo, useEffect } from "react";
import { motion } from "motion/react";
import { FileText, Check, Loader2, Inbox } from "lucide-react";
import classNames from "classnames";

import type { VLResource } from "@/types/vibe-learning";

interface ResourceSelectorProps {
  /** 资源列表 */
  resources: VLResource[];
  /** 选中的资源 ID 列表 */
  selectedResourceIds: number[];
  /** 是否正在加载 */
  loading: boolean;
  /** 是否全部选中 */
  isAllSelected: boolean;
  /** 切换单个资源的选择状态 */
  onToggleResource: (resourceId: number) => void;
  /** 全选/取消全选 */
  onToggleAll: () => void;
  /** 加载资源列表 */
  onLoad?: () => void;
  /** 最大高度 */
  maxHeight?: string;
  /** 空状态文案 */
  emptyText?: string;
  /** 是否显示标题和操作按钮 */
  showHeader?: boolean;
  /** 标题 */
  title?: string;
}

/**
 * 资源选择组件
 * 用于显示资源列表并支持多选
 */
const ResourceSelector = memo((props: ResourceSelectorProps) => {
  const {
    resources,
    selectedResourceIds,
    loading,
    isAllSelected,
    onToggleResource,
    onToggleAll,
    onLoad,
    maxHeight = "14rem",
    emptyText = "暂无可用资源",
    showHeader = true,
    title = "选择资源",
  } = props;

  // 组件挂载时加载资源
  useEffect(() => {
    onLoad?.();
  }, [onLoad]);

  // 加载中状态
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="text-accent h-8 w-8 animate-spin" strokeWidth={1.75} />
        <p className="text-ink-2 mt-3 text-sm">加载资源中...</p>
      </div>
    );
  }

  // 空状态
  if (resources.length === 0) {
    return (
      <div className="border-line-1 flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-12">
        <Inbox className="text-ink-3 mb-3 h-12 w-12" strokeWidth={1.75} />
        <p className="text-ink-2 text-sm">{emptyText}</p>
      </div>
    );
  }

  return (
    <div>
      {showHeader && (
        <div className="mb-3 flex items-center justify-between">
          <label className="text-ink-2 text-[11px] font-semibold uppercase tracking-wider">
            {title}
          </label>
          <button
            type="button"
            onClick={onToggleAll}
            className="dark:hover: text-accent hover:text-accent-text text-xs font-medium transition-colors"
          >
            {isAllSelected ? "取消全选" : "全选"}
          </button>
        </div>
      )}

      <div className="border-line-1 bg-group overflow-auto rounded-xl border" style={{ maxHeight }}>
        {resources.map((resource, index) => {
          const isSelected = selectedResourceIds.includes(resource.id);
          return (
            <motion.div
              key={resource.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.02 }}
              className={classNames(
                "flex cursor-pointer items-center gap-3 px-4 py-3 transition-all",
                "border-line-1 border-b last:border-b-0",
                isSelected ? "bg-accent-soft" : "hover:bg-hover/50"
              )}
              onClick={() => onToggleResource(resource.id)}
            >
              <div
                className={classNames(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all",
                  isSelected ? "border-accent bg-accent" : "border-line-1"
                )}
              >
                {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={1.75} />}
              </div>
              <FileText className="text-ink-3 h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span className="text-ink-2 flex-1 truncate text-sm">{resource.name}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
});

ResourceSelector.displayName = "ResourceSelector";

export default ResourceSelector;
