import React, { useState } from "react";
import { Modal, Button } from "antd";
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
  title?: string;
  initialContents?: SearchResult[];
}

const defaultExcudeIds: number[] = [];
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
  title,
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
    return excludeIds.includes(item.id);
  };

  return (
    <Modal
      title={title}
      open={open}
      onCancel={handleCancel}
      footer={
        multiple
          ? [
              <Button key="cancel" onClick={handleCancel}>
                取消
              </Button>,
              <Button
                key="submit"
                type="primary"
                onClick={handleConfirm}
                disabled={selectedItems.length === 0}
              >
                确定({selectedItems.length})
              </Button>,
            ]
          : null
      }
      width={800}
      destroyOnClose
      styles={{
        body: {
          maxHeight: 800,
        },
      }}
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
    </Modal>
  );
};

export default ContentSelectorModal;
