import React, { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import CustomModal from "@/components/CustomModal";
import ContentSelector from "@/components/ContentSelector";
import { SearchResult, IndexType } from "@/types/search";

export interface ContentSelectorModalProps {
  open: boolean;
  onCancel: () => void;
  onSelect: (items: SearchResult | SearchResult[]) => void;
  contentType: IndexType | IndexType[];
  extensions: any[];
  emptyDescription?: string;
  showTitle?: boolean;
  multiple?: boolean;
  excludeIds?: number[];
  excludeContentIds?: number[];
  title?: string;
  subtitle?: React.ReactNode;
  initialContents?: SearchResult[];
}

const defaultExcudeIds: number[] = [];
const defaultExcludeContentIds: number[] = [];
const defaultInitialContents: SearchResult[] = [];
const ContentSelectorModal: React.FC<ContentSelectorModalProps> = ({
  open,
  onCancel,
  onSelect,
  contentType,
  extensions,
  emptyDescription = "无结果",
  showTitle = true,
  multiple = false,
  excludeIds = defaultExcudeIds,
  excludeContentIds = defaultExcludeContentIds,
  title = "选择内容",
  subtitle,
  initialContents = defaultInitialContents,
}) => {
  const [selectedItems, setSelectedItems] = useState<SearchResult[]>([]);

  const handleSelect = (item: SearchResult) => {
    // 从handleSelect函数中移除检查，由ContentSelector组件负责禁用排除的项目
    if (!multiple) {
      onSelect(item);
      onCancel();
      return;
    }

    // 多选模式
    setSelectedItems(prev => {
      // 检查是否已选择
      const existIndex = prev.findIndex(i => i.id === item.id && i.type === item.type);

      if (existIndex >= 0) {
        // 如果已选择，则移除该项
        return prev.filter((_, index) => index !== existIndex);
      } else {
        // 如果未选择，则添加该项
        return [...prev, item];
      }
    });
  };

  const handleConfirm = () => {
    if (multiple && selectedItems.length > 0) {
      onSelect(selectedItems);
      onCancel();
      // 重置选中状态
      setSelectedItems([]);
    }
  };

  // 当Modal关闭时重置选中状态
  const handleCancel = () => {
    setSelectedItems([]);
    onCancel();
  };

  const isItemSelected = (item: SearchResult): boolean => {
    return selectedItems.some(i => i.id === item.id && i.type === item.type);
  };

  // 判断项目是否被禁用
  const isItemDisabled = (item: SearchResult): boolean => {
    return excludeIds.includes(item.id) || excludeContentIds.includes(item.contentId);
  };

  const icon = (
    <svg
      className="h-5 w-5 text-[var(--th-accent)]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
      <path d="M9 2v6h6" />
    </svg>
  );

  const footer = multiple ? (
    <div className="flex justify-end gap-3">
      <button
        onClick={handleCancel}
        className="cursor-pointer rounded-xl border border-gray-200 bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-200 dark:border-slate-700 dark:bg-zinc-800 dark:text-slate-300 dark:hover:bg-zinc-700"
      >
        取消
      </button>
      <button
        onClick={handleConfirm}
        disabled={selectedItems.length === 0}
        className="cursor-pointer rounded-xl border-none bg-[var(--th-btn-bg)] px-5 py-2.5 text-sm font-semibold text-[var(--th-btn-text)] shadow-sm transition-all hover:-translate-y-px hover:bg-[var(--th-btn-hover)] active:translate-y-0 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:border dark:disabled:border-slate-700 dark:disabled:bg-zinc-800 dark:disabled:text-slate-500"
      >
        确定({selectedItems.length})
      </button>
    </div>
  ) : null;

  return (
    <AnimatePresence>
      {open && (
        <CustomModal
          open={open}
          onCancel={handleCancel}
          width={800}
          title={title}
          subtitle={subtitle}
          icon={icon}
          iconBgColor="bg-[var(--th-accent-soft)] border-[var(--th-border-focus)]/30"
          footer={footer}
          closeOnEscape={!multiple}
          contentClassName="h-[min(860px,calc(100vh-120px))]"
        >
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="h-full min-h-0"
          >
            <ContentSelector
              onSelect={handleSelect}
              contentType={contentType}
              extensions={extensions}
              emptyDescription={emptyDescription}
              showTitle={showTitle}
              isItemSelected={multiple ? isItemSelected : undefined}
              isItemDisabled={isItemDisabled}
              initialContents={initialContents}
            />
          </motion.div>
        </CustomModal>
      )}
    </AnimatePresence>
  );
};

export default ContentSelectorModal;
