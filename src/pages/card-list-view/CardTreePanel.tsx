import { useMemoizedFn, useCreation, useLocalStorageState } from "ahooks";
import { memo, useMemo } from "react";
import TagItem from "@/components/TagItem";
import useCardTree from "@/hooks/useCardTree";
import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import { ICard } from "@/types";
import { Empty } from "antd";

interface CardTreePanelProps {
  cards: ICard[];
  activeCardTag: string;
  onClickTag: (tag: string) => void;
}

const CardTreePanel = memo(
  ({ cards, activeCardTag, onClickTag }: CardTreePanelProps) => {
    const { cardTree } = useCardTree(cards);

    const [width, setWidth] = useLocalStorageState("card-tree-width", {
      defaultValue: 300,
    });

    // 使用useMemoizedFn缓存回调函数，防止每次渲染创建新函数
    const handleClickTag = useMemoizedFn((tag: string) => {
      onClickTag(tag);
    });

    const handleWidthChange = useMemoizedFn((newWidth: number) => {
      setWidth(newWidth);
    });

    // 使用useCreation只有cardTree实际变化时才会重新计算
    const memoizedTree = useCreation(() => cardTree, [cardTree]);

    // 使用useMemo将tree转换为优化的组件列表，只在必要时更新
    const tagItemList = useMemo(() => {
      if (memoizedTree.length === 0) {
        return (
          <div className="flex justify-center items-center h-full">
            <Empty description="暂无标签" />
          </div>
        );
      }

      return memoizedTree.map((card) => (
        <TagItem
          key={card.tag}
          item={card}
          onClickTag={handleClickTag}
          activeTag={activeCardTag}
        />
      ));
    }, [memoizedTree, activeCardTag, handleClickTag]);

    return (
      <ResizableAndHideableSidebar
        side="right"
        width={width || 300}
        onWidthChange={handleWidthChange}
        open={true}
        disableResize={false}
        className="h-full"
        minWidth={200}
        maxWidth={400}
      >
        <div className="bg-[var(--second-sidevar-background)] border-[20px] border-transparent box-border transition-all duration-300 w-full h-full overflow-auto [&::-webkit-scrollbar]:hidden">
          {tagItemList}
        </div>
      </ResizableAndHideableSidebar>
    );
  },
);

// 提供显示名称以便于调试
CardTreePanel.displayName = "CardTreePanel";

export default CardTreePanel;
