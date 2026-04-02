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
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
          加载资源中...
        </p>
      </div>
    );
  }

  // 空状态
  if (resources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
        <Inbox className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400">{emptyText}</p>
      </div>
    );
  }

  return (
    <div>
      {showHeader && (
        <div className="flex items-center justify-between mb-3">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
            {title}
          </label>
          <button
            type="button"
            onClick={onToggleAll}
            className="text-xs font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
          >
            {isAllSelected ? "取消全选" : "全选"}
          </button>
        </div>
      )}

      <div
        className="overflow-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-zinc-800/50"
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
                "flex items-center gap-3 px-4 py-3 cursor-pointer transition-all",
                "border-b border-gray-100 dark:border-gray-700/50 last:border-b-0",
                isSelected
                  ? "bg-blue-50 dark:bg-blue-500/10"
                  : "hover:bg-gray-100 dark:hover:bg-zinc-700/50",
              )}
              onClick={() => onToggleResource(resource.id)}
            >
              <div
                className={classNames(
                  "shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                  isSelected
                    ? "bg-blue-500 border-blue-500"
                    : "border-gray-300 dark:border-gray-600",
                )}
              >
                {isSelected && <Check className="w-3 h-3 text-white" />}
              </div>
              <FileText className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
              <span className="flex-1 text-sm text-gray-700 dark:text-gray-200 truncate">
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
