import { useMemoizedFn, useCreation } from "ahooks";
import { memo } from "react";
import For from "@/components/For";
import TagItem from "@/components/TagItem";
import useCardTree from "@/hooks/useCardTree";
import styles from "./index.module.less";

interface CardTreePanelProps {
  activeCardTag: string;
  onClickTag: (tag: string) => void;
}

const CardTreePanel = memo(
  ({ activeCardTag, onClickTag }: CardTreePanelProps) => {
    const { cardTree } = useCardTree();

    // 使用useMemoizedFn缓存回调函数，防止每次渲染创建新函数
    const handleClickTag = useMemoizedFn((tag: string) => {
      onClickTag(tag);
    });

    // 使用useCreation只有cardTree实际变化时才会重新计算
    const memoizedTree = useCreation(() => cardTree, [cardTree]);

    return (
      <div className={styles.cardTree}>
        <For
          data={memoizedTree}
          renderItem={(card) => (
            <TagItem
              key={card.tag}
              item={card}
              onClickTag={handleClickTag}
              activeTag={activeCardTag}
            />
          )}
        />
      </div>
    );
  },
);

// 提供显示名称以便于调试
CardTreePanel.displayName = "CardTreePanel";

export default CardTreePanel;
