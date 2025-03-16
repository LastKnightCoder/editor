import { useMemo, useRef, useState } from "react";
import classnames from "classnames";
import { Empty, Select, Dropdown, MenuProps, FloatButton } from "antd";
import { useMemoizedFn } from "ahooks";

import For from "@/components/For";
import LoadMoreComponent from "@/components/LoadMoreComponent";
import TagItem from "@/components/TagItem";
import { PlusOutlined, UpOutlined } from "@ant-design/icons";
import CardItem from "./CardItem";
import Card from "../../../components/EditCards";

import useCardsManagementStore from "@/stores/useCardsManagementStore";
import useCardPanelStore from "@/stores/useCardPanelStore";
import useCardTree from "@/hooks/useCardTree";
import { ECardCategory, ICreateCard } from "@/types";
import { cardCategoryName } from "@/constants";
import CreateCard from "./CreateCard";

import styles from "./index.module.less";
import { Descendant } from "slate";
import If from "@/components/If";
import { readTextFile, selectFile } from "@/commands";
import { getContentLength, importFromMarkdown } from "@/utils";

const CardContainer = () => {
  const { cardTree } = useCardTree();
  const [isCreatingCard, setIsCreatingCard] = useState(false);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const { cards, selectCategory, activeCardTag, createCard } =
    useCardsManagementStore((state) => ({
      cards: state.cards,
      selectCategory: state.selectCategory,
      activeCardTag: state.activeCardTag,
      createCard: state.createCard,
    }));

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

  const [cardsCount, setCardsCount] = useState<number>(5);

  const sliceCards = filteredCards.slice(0, cardsCount);

  const { leftCardIds, rightCardIds } = useCardPanelStore((state) => ({
    leftCardIds: state.leftCardIds,
    rightCardIds: state.rightCardIds,
  }));

  const isShowEdit = useMemo(() => {
    return leftCardIds.length > 0 || rightCardIds.length > 0;
  }, [leftCardIds, rightCardIds]);

  const menuItems: MenuProps["items"] = [
    {
      label: "创建卡片",
      key: "create-card",
    },
    {
      label: "导入Markdown",
      key: "import-markdown",
    },
  ];

  const handleClickCreate = useMemoizedFn(async ({ key }: { key: string }) => {
    if (key === "create-card") {
      if (!isCreatingCard) {
        setIsCreatingCard(true);
      }
    } else if (key === "import-markdown") {
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
    }
  });

  const onSaveCard = useMemoizedFn(
    async (content: Descendant[], tags: string[]) => {
      const card: ICreateCard = {
        content,
        tags,
        links: [],
        category: selectCategory,
        count: 0,
      };
      await createCard(card);
      setIsCreatingCard(false);
    },
  );

  const loadMore = useMemoizedFn(async () => {
    setCardsCount(Math.min(cardsCount + 5, filteredCards.length));
  });

  const onSelectCategoryChange = useMemoizedFn((category: ECardCategory) => {
    useCardsManagementStore.setState({
      selectCategory: category,
    });
  });

  const onClickTag = useMemoizedFn((tag: string) => {
    useCardsManagementStore.setState({
      activeCardTag: tag === activeCardTag ? "" : tag,
    });
    listRef.current?.scrollTo({
      top: 0,
      behavior: "smooth",
    });
    setCardsCount(5);
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
            <div className={styles.cardTree}>
              <For
                data={cardTree}
                renderItem={(card) => (
                  <TagItem
                    key={card.tag}
                    item={card}
                    onClickTag={onClickTag}
                    activeTag={activeCardTag}
                  />
                )}
              />
            </div>
            <If condition={!isShowEdit}>
              <div className={styles.cardContainer}>
                <div className={styles.cardList}>
                  <div className={styles.header}>
                    <div className={styles.left}>
                      <div className={styles.title}>卡片</div>
                      <Select
                        value={selectCategory}
                        options={Object.keys(cardCategoryName).map((key) => ({
                          label: cardCategoryName[key as ECardCategory],
                          value: key,
                        }))}
                        onChange={onSelectCategoryChange}
                      />
                    </div>
                    <Dropdown
                      menu={{
                        items: menuItems,
                        onClick: handleClickCreate,
                      }}
                    >
                      <div className={styles.addCard}>
                        <PlusOutlined />
                      </div>
                    </Dropdown>
                  </div>
                  {isCreatingCard && (
                    <CreateCard
                      className={styles.createCard}
                      onSave={onSaveCard}
                      onCancel={() => {
                        setIsCreatingCard(false);
                      }}
                    />
                  )}
                  <div
                    className={styles.list}
                    ref={listRef}
                    onScroll={(e) => {
                      if (e.currentTarget.scrollTop > 100) {
                        setShowScrollToTop(true);
                      } else {
                        setShowScrollToTop(false);
                      }
                    }}
                  >
                    <If condition={filteredCards.length === 0}>
                      <Empty description={"暂无卡片"} />
                    </If>
                    <If condition={filteredCards.length > 0}>
                      <LoadMoreComponent
                        onLoadMore={loadMore}
                        showLoader={cardsCount < filteredCards.length}
                      >
                        <For
                          data={sliceCards}
                          renderItem={(card) => (
                            <CardItem key={card.id} card={card} />
                          )}
                        />
                      </LoadMoreComponent>
                    </If>
                  </div>
                </div>
              </div>
            </If>
          </div>
        </div>
        <If condition={isShowEdit}>
          <div className={styles.edit}>
            <Card />
          </div>
        </If>
      </div>
      {!isShowEdit && showScrollToTop && (
        <FloatButton
          style={{
            position: "absolute",
            // right: 0,
            // bottom: 0,
          }}
          icon={<UpOutlined />}
          tooltip={"回到顶部"}
          onClick={() => {
            listRef.current?.scrollTo({
              top: 0,
              behavior: "smooth",
            });
          }}
        />
      )}
    </div>
  );
};

export default CardContainer;
