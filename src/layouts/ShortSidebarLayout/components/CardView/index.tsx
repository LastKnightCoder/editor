import { useMemo, useRef, useState, useEffect } from "react";
import classnames from "classnames";
import { Empty, Select, Dropdown, MenuProps, FloatButton } from "antd";
import { useMemoizedFn, useThrottleFn } from "ahooks";
import { useShallow } from "zustand/react/shallow";
import { useVirtualizer } from "@tanstack/react-virtual";

import For from "@/components/For";
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
  const [isPresentation, setIsPresentation] = useState(false);
  const { cards, selectCategory, activeCardTag, createCard } =
    useCardsManagementStore(
      useShallow((state) => ({
        cards: state.cards,
        selectCategory: state.selectCategory,
        activeCardTag: state.activeCardTag,
        createCard: state.createCard,
      })),
    );

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

  // 使用 react-virtual 的虚拟滚动
  const virtualizer = useVirtualizer({
    count: filteredCards.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 350, // 调整预估卡片高度，包含边距
    overscan: 5, // 预加载的项目数量
    // 获取实际元素的尺寸，支持动态高度
    getItemKey: (index) => filteredCards[index].id,
    // 确保只有可见的卡片被渲染和测量
    measureElement: (el) => {
      const card = el.firstElementChild;
      if (!card) return 350; // 默认高度
      // 包括元素自身和边距的高度
      return el.getBoundingClientRect().height;
    },
  });

  const scrollToTop = useMemoizedFn(() => {
    // 使用虚拟滚动的方式滚动到顶部
    virtualizer.scrollToIndex(0);
  });

  // 使用 throttle 优化滚动事件处理
  const { run: throttledCheckScroll } = useThrottleFn(
    () => {
      const scrollElement = listRef.current;
      if (!scrollElement) return;
      const { scrollTop } = scrollElement;

      // 滚动位置检测 - 控制回到顶部按钮显示
      if (scrollTop > 100) {
        setShowScrollToTop(true);
      } else {
        setShowScrollToTop(false);
      }
    },
    { wait: 100 },
  );

  // 监听滚动事件，仅用于控制回到顶部按钮显示
  useEffect(() => {
    const scrollElement = listRef.current;
    if (!scrollElement) return;

    scrollElement.addEventListener("scroll", throttledCheckScroll);
    return () => {
      scrollElement.removeEventListener("scroll", throttledCheckScroll);
    };
  }, []);

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

  const onSelectCategoryChange = useMemoizedFn((category: ECardCategory) => {
    useCardsManagementStore.setState({
      selectCategory: category,
    });
  });

  const onClickTag = useMemoizedFn((tag: string) => {
    useCardsManagementStore.setState({
      activeCardTag: tag === activeCardTag ? "" : tag,
    });
    // 滚动到顶部适配虚拟滚动
    scrollToTop();
  });

  const onPresentationMode = useMemoizedFn(() => {
    setIsPresentation(true);
  });

  const onExitPresentationMode = useMemoizedFn(() => {
    setIsPresentation(false);
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
                  <CreateCard
                    className={styles.createCard}
                    visible={isCreatingCard}
                    onSave={onSaveCard}
                    onCancel={() => {
                      setIsCreatingCard(false);
                    }}
                  />
                  <div className={styles.list} ref={listRef}>
                    <If condition={filteredCards.length === 0}>
                      <Empty description={"暂无卡片"} />
                    </If>
                    <If condition={filteredCards.length > 0}>
                      <div
                        style={{
                          height: `${virtualizer.getTotalSize()}px`,
                          width: "100%",
                          position: "relative",
                        }}
                      >
                        {virtualizer.getVirtualItems().map((virtualItem) => {
                          const card = filteredCards[virtualItem.index];
                          return (
                            <div
                              key={virtualItem.key}
                              data-index={virtualItem.index}
                              ref={virtualizer.measureElement}
                              style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                transform: `translateY(${virtualItem.start}px)`,
                                padding: "10px 0", // 添加上下间距
                              }}
                            >
                              <CardItem
                                card={card}
                                onPresentationMode={onPresentationMode}
                                onExitPresentationMode={onExitPresentationMode}
                              />
                            </div>
                          );
                        })}
                      </div>
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
      {!isShowEdit && showScrollToTop && !isPresentation && (
        <FloatButton
          style={{
            position: "absolute",
          }}
          icon={<UpOutlined />}
          tooltip={"回到顶部"}
          onClick={scrollToTop}
        />
      )}
    </div>
  );
};

export default CardContainer;
