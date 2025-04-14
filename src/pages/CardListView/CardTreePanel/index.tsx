import { useMemoizedFn, useCreation } from "ahooks";
import { memo, useMemo } from "react";
import TagItem from "@/components/TagItem";
import useCardTree from "@/hooks/useCardTree";
import styles from "./index.module.less";
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

    // 使用useMemoizedFn缓存回调函数，防止每次渲染创建新函数
    const handleClickTag = useMemoizedFn((tag: string) => {
      onClickTag(tag);
    });

    // 使用useCreation只有cardTree实际变化时才会重新计算
    const memoizedTree = useCreation(() => cardTree, [cardTree]);

    // 使用useMemo将tree转换为优化的组件列表，只在必要时更新
    const tagItemList = useMemo(() => {
      console.log(memoizedTree);
      if (memoizedTree.length === 0) {
        return (
          <div className={styles.empty}>
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

    return <div className={styles.cardTree}>{tagItemList}</div>;
  },
);

// 提供显示名称以便于调试
CardTreePanel.displayName = "CardTreePanel";

export default CardTreePanel;
