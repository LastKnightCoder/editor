import { useMemo, useRef } from "react";
import classnames from "classnames";
import { useShallow } from "zustand/react/shallow";
import { useMemoizedFn } from "ahooks";
import If from "@/components/If";
import CardTreePanel from "./CardTreePanel";
import CardListPanel from "./CardListPanel";
import { CardListPanelRef } from "./CardListPanel";
import Card from "../../../components/EditCards";
import useCardsManagementStore from "@/stores/useCardsManagementStore";
import useCardPanelStore from "@/stores/useCardPanelStore";
import { ECardCategory, ICreateCard } from "@/types";
import { readTextFile, selectFile } from "@/commands";
import { getContentLength, importFromMarkdown } from "@/utils";

import styles from "./index.module.less";

const CardContainer = () => {
  const cardListRef = useRef<CardListPanelRef>(null);

  // 使用更细粒度的状态选择器，避免不必要的重渲染
  const selectCategory = useCardsManagementStore(
    (state) => state.selectCategory,
  );
  const activeCardTag = useCardsManagementStore((state) => state.activeCardTag);
  const cards = useCardsManagementStore((state) => state.cards);
  const createCard = useCardsManagementStore((state) => state.createCard);

  const filteredCards = useMemo(() => {
    const cardWithCategory = cards.filter((card) => {
      return card.category === selectCategory;
    });

    if (!activeCardTag) return cardWithCategory;
    return cardWithCategory.filter((card) =>
      card.tags.some((tag) => {
        const activeCardTags = activeCardTag.split("/");
        const tags = tag.split("/");
        if (tags.length < activeCardTags.length) return false;
        for (let i = 0; i < activeCardTags.length; i++) {
          if (activeCardTags[i] !== tags[i]) return false;
        }
        return true;
      }),
    );
  }, [activeCardTag, cards, selectCategory]);

  const { leftCardIds, rightCardIds } = useCardPanelStore(
    useShallow((state) => ({
      leftCardIds: state.leftCardIds,
      rightCardIds: state.rightCardIds,
    })),
  );

  const isShowEdit = useMemo(() => {
    return leftCardIds.length > 0 || rightCardIds.length > 0;
  }, [leftCardIds, rightCardIds]);

  const onSelectCategoryChange = useMemoizedFn((category: ECardCategory) => {
    useCardsManagementStore.setState({
      selectCategory: category,
    });
  });

  // 使用useCallback代替useMemoizedFn，更精确地控制依赖
  const onClickTag = useMemoizedFn((tag: string) => {
    useCardsManagementStore.setState({
      activeCardTag: tag === activeCardTag ? "" : tag,
    });
    // 点击标签后滚动到顶部
    cardListRef.current?.scrollToTop();
  });

  const onCreateCard = useMemoizedFn(async (card: ICreateCard) => {
    await createCard(card);
  });

  const onImportMarkdown = useMemoizedFn(async () => {
    const filePath = await selectFile({
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Markdown",
          extensions: ["md"],
        },
      ],
    });
    if (!filePath) return;
    for (const path of filePath) {
      const markdown = await readTextFile(path);
      const content = importFromMarkdown(markdown);
      await createCard({
        content,
        tags: [],
        links: [],
        category: selectCategory,
        count: getContentLength(content),
      });
    }
  });

  return (
    <div className={styles.queryContainer}>
      <div
        className={classnames(styles.container, {
          [styles.showEdit]: isShowEdit,
        })}
      >
        <div className={styles.list}>
          <div className={styles.cards}>
            <CardTreePanel
              activeCardTag={activeCardTag}
              onClickTag={onClickTag}
            />
            <CardListPanel
              ref={cardListRef}
              cards={filteredCards}
              selectCategory={selectCategory}
              isShowEdit={isShowEdit}
              onSelectCategoryChange={onSelectCategoryChange}
              onCreateCard={onCreateCard}
              onImportMarkdown={onImportMarkdown}
            />
          </div>
        </div>
        <If condition={isShowEdit}>
          <div className={styles.edit}>
            <Card />
          </div>
        </If>
      </div>
    </div>
  );
};

export default CardContainer;
