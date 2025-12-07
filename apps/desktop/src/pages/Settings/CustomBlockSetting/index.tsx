import { useEffect, useState } from "react";
import { message } from "antd";
import { MdAdd, MdWidgets } from "react-icons/md";
import { useMemoizedFn } from "ahooks";
import useThemeColors from "@/hooks/useThemeColors";
import useCustomBlockStore from "@/stores/useCustomBlockStore";
import type { ICustomBlock } from "@/types/custom-block";
import CreateCustomBlock from "./CreateCustomBlock";
import CustomBlockDetail from "./CustomBlockDetail";
import BlockCard from "./BlockCard";
import { LoadingOutlined } from "@ant-design/icons";

type ViewMode = "list" | "create" | "detail";

const CustomBlockSetting = () => {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const themeColors = useThemeColors();

  const { blocks, loading, loadBlocks, toggleBlockEnabled } =
    useCustomBlockStore((state) => ({
      blocks: state.blocks,
      loading: state.loading,
      loadBlocks: state.loadBlocks,
      toggleBlockEnabled: state.toggleBlockEnabled,
    }));

  useEffect(() => {
    loadBlocks();
  }, [loadBlocks]);

  const handleCreateClick = useMemoizedFn(() => {
    setViewMode("create");
  });

  const handleBlockClick = useMemoizedFn((blockId: string) => {
    setSelectedBlockId(blockId);
    setViewMode("detail");
  });

  const handleBackToList = useMemoizedFn(() => {
    setViewMode("list");
    setSelectedBlockId(null);
    loadBlocks(); // 刷新列表
  });

  const handleToggleEnabled = useMemoizedFn(
    async (blockId: string, _checked: boolean, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await toggleBlockEnabled(blockId);
        message.success("更新成功");
      } catch (error) {
        message.error("更新失败");
      }
    },
  );

  if (viewMode === "list") {
    return (
      <div className="w-full h-full overflow-auto p-10 px-12">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-[28px] font-semibold text-text-1 m-0 mb-2 tracking-tight">
              自定义组件
            </h1>
            <p className="text-sm text-text-2 m-0">管理你的自定义 React 组件</p>
          </div>
          <button
            onClick={handleCreateClick}
            className={`px-5 py-2.5 border-none rounded-lg text-sm font-medium cursor-pointer flex items-center gap-2 transition-colors ${themeColors.primaryButtonClass}`}
          >
            <MdAdd className="w-4 h-4" />
            <span>添加组件</span>
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[400px]">
            <LoadingOutlined />
          </div>
        ) : blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
            <MdWidgets className="w-16 h-16 text-text-3 opacity-50 mb-4" />
            <h2 className="text-lg font-semibold text-text-1 mb-2">
              暂无自定义组件
            </h2>
            <p className="text-sm text-text-2 mb-6">
              创建你的第一个组件，让编辑器更加强大
            </p>
            <button
              onClick={handleCreateClick}
              className={`px-5 py-2.5 border-none rounded-lg text-sm font-medium cursor-pointer flex items-center gap-2 transition-colors ${themeColors.primaryButtonClass}`}
            >
              <MdAdd className="w-4 h-4" />
              <span>创建第一个组件</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {blocks.map((block: ICustomBlock) => (
              <BlockCard
                key={block.id}
                block={block}
                mode="list"
                onClick={() => handleBlockClick(block.id)}
                onToggle={(checked, e) =>
                  handleToggleEnabled(block.id, checked, e)
                }
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // 创建视图
  if (viewMode === "create") {
    return <CreateCustomBlock onBack={handleBackToList} />;
  }

  // 详情视图
  if (viewMode === "detail" && selectedBlockId) {
    return (
      <CustomBlockDetail blockId={selectedBlockId} onBack={handleBackToList} />
    );
  }

  return null;
};

export default CustomBlockSetting;
