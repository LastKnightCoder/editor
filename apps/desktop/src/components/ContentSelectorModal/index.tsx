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
    setSelectedItems((prev) => {
      // 检查是否已选择
      const existIndex = prev.findIndex(
        (i) => i.id === item.id && i.type === item.type,
      );

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
    return selectedItems.some((i) => i.id === item.id && i.type === item.type);
  };

  // 判断项目是否被禁用
  const isItemDisabled = (item: SearchResult): boolean => {
    return (
      excludeIds.includes(item.id) || excludeContentIds.includes(item.contentId)
    );
  };

  const icon = (
    <svg
      className="w-5 h-5 text-purple-500"
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
        className="px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700"
      >
        取消
      </button>
      <button
        onClick={handleConfirm}
        disabled={selectedItems.length === 0}
        className="px-5 py-2.5 rounded-xl border-none text-sm font-semibold cursor-pointer transition-all bg-purple-500 text-white shadow-[0_4px_14px_rgba(168,85,247,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:bg-purple-600 hover:-translate-y-px active:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none dark:disabled:border dark:disabled:border-slate-700"
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
          icon={icon}
          iconBgColor="bg-purple-50 dark:bg-purple-500/20 border-purple-200 dark:border-purple-500/30"
          footer={footer}
          closeOnEscape={!multiple}
        >
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            style={{ maxHeight: 800 }}
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
