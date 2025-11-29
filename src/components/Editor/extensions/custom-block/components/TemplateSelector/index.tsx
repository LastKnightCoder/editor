import { useEffect, useState, useMemo } from "react";
import { Spin, Input } from "antd";
import { MdWidgets, MdSearch } from "react-icons/md";
import { useMemoizedFn } from "ahooks";
import useCustomBlockStore from "@/stores/useCustomBlockStore";
import BlockCard from "@/pages/Settings/CustomBlockSetting/BlockCard";
import type { Editor } from "slate";
import styles from "./index.module.less";
import CustomModal from "@/components/CustomModal";

interface TemplateSelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (source: string) => void;
  editor: Editor;
}

const TemplateSelector = ({
  visible,
  onClose,
  onSelect,
}: TemplateSelectorProps) => {
  const [searchText, setSearchText] = useState("");

  const { blocks, loading, loadBlocks, getEnabledBlocks } = useCustomBlockStore(
    (state) => ({
      blocks: state.blocks,
      loading: state.loading,
      loadBlocks: state.loadBlocks,
      getEnabledBlocks: state.getEnabledBlocks,
    }),
  );

  useEffect(() => {
    if (visible && blocks.length === 0) {
      loadBlocks();
    }
  }, [visible, blocks.length, loadBlocks]);

  // 重置搜索框当弹窗关闭时
  useEffect(() => {
    if (!visible) {
      setSearchText("");
    }
  }, [visible]);

  const enabledBlocks = getEnabledBlocks();

  // 根据搜索文本筛选组件
  const filteredBlocks = useMemo(() => {
    if (!searchText.trim()) {
      return enabledBlocks;
    }
    const lowerSearchText = searchText.toLowerCase().trim();
    return enabledBlocks.filter((block) =>
      block.manifest.name.toLowerCase().includes(lowerSearchText),
    );
  }, [enabledBlocks, searchText]);

  const handleSelect = useMemoizedFn((source: string) => {
    onSelect(source);
    onClose();
  });

  return (
    <CustomModal
      title="选择组件模板"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={1200}
      contentClassName={styles.modalContent}
      centered
      maskClosable={false}
    >
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-75">
          <Spin size="large" />
        </div>
      ) : enabledBlocks.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-75 text-center">
          <MdWidgets className="w-12 h-12 text-text-2 opacity-50 mb-4" />
          <h3 className="text-base font-semibold text-text-1 mb-2">
            暂无可用的组件模板
          </h3>
          <p className="text-sm text-text-2">请先在设置中启用组件模板</p>
        </div>
      ) : (
        <>
          {/* 搜索框 */}
          <div className="mb-6">
            <Input
              placeholder="搜索组件名称..."
              prefix={<MdSearch className="text-text-2" />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
              size="large"
              className="h-10 bg-bg-input dark:bg-bg-input border-border-1 dark:border-border-1 text-text-1 dark:text-text-1 rounded-lg hover:border-brand focus:border-brand"
            />
          </div>

          {/* 组件网格 */}
          {filteredBlocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-75 text-center">
              <MdWidgets className="w-12 h-12 text-text-2 opacity-50 mb-4" />
              <h3 className="text-base font-semibold text-text-1 mb-2">
                未找到匹配的组件
              </h3>
              <p className="text-sm text-text-2">尝试使用其他关键词搜索</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredBlocks.map((block) => (
                <BlockCard
                  key={block.id}
                  block={block}
                  mode="select"
                  onClick={() => handleSelect(block.source)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </CustomModal>
  );
};

export default TemplateSelector;
