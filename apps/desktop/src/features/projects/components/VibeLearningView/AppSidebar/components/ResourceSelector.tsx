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
        <Loader2 className="h-8 w-8 animate-spin text-[var(--th-accent)]" strokeWidth={1.75} />
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">加载资源中...</p>
      </div>
    );
  }

  // 空状态
  if (resources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-12 dark:border-gray-700">
        <Inbox className="mb-3 h-12 w-12 text-gray-300 dark:text-gray-600" strokeWidth={1.75} />
        <p className="text-sm text-gray-500 dark:text-gray-400">{emptyText}</p>
      </div>
    );
  }

  return (
    <div>
      {showHeader && (
        <div className="mb-3 flex items-center justify-between">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
            {title}
          </label>
          <button
            type="button"
            onClick={onToggleAll}
            className="dark:hover: text-xs font-medium text-[var(--th-accent)] transition-colors hover:text-[var(--th-active-text)]"
          >
            {isAllSelected ? "取消全选" : "全选"}
          </button>
        </div>
      )}

      <div
        className="overflow-auto rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-zinc-800/50"
        style={{ maxHeight }}
      >
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
                "border-b border-gray-100 last:border-b-0 dark:border-gray-700/50",
                isSelected
                  ? "bg-[var(--th-accent-soft)]"
                  : "hover:bg-gray-100 dark:hover:bg-zinc-700/50"
              )}
              onClick={() => onToggleResource(resource.id)}
            >
              <div
                className={classNames(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all",
                  isSelected
                    ? "border-[var(--th-accent)] bg-[var(--th-accent)]"
                    : "border-gray-300 dark:border-gray-600"
                )}
              >
                {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={1.75} />}
              </div>
              <FileText
                className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"
                strokeWidth={1.75}
              />
              <span className="flex-1 truncate text-sm text-gray-700 dark:text-gray-200">
                {resource.name}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
});

ResourceSelector.displayName = "ResourceSelector";

export default ResourceSelector;
