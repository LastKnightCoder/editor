import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMemoizedFn } from "ahooks";
import { Breadcrumb, Dropdown, MenuProps, FloatButton } from "antd";
import {
  LoadingOutlined,
  PlusOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { ICard, ECardCategory, ICreateCard } from "@/types";
import {
  getAllCards,
  createCard,
  deleteCard,
  updateCard,
} from "@/commands/card";
import CardTreePanel from "./CardTreePanel";
import CardListPanel, { CardListPanelRef } from "./CardListPanel";
import Titlebar from "@/layouts/components/Titlebar";
import CardGraph from "@/layouts/components/CardGraph";
import CreateCard from "./CreateCard";
import styles from "./index.module.less";
import { cardCategoryName } from "@/constants";
import { Descendant } from "slate";
import { readTextFile, selectFile } from "@/commands";
import { getContentLength, importFromMarkdown } from "@/utils";
import { PiGraphLight } from "react-icons/pi";
import { BiCategory } from "react-icons/bi";
import useCardsManagementStore, {
  ViewMode,
} from "@/stores/useCardsManagementStore";
import { useShallow } from "zustand/react/shallow";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";

const CardListView = () => {
  const navigate = useNavigate();
  const [cards, setCards] = useState<ICard[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreatingCard, setIsCreatingCard] = useState(false);
  const isConnected = useDatabaseConnected();
  const database = useSettingStore((state) => state.setting.database.active);

  const cardListRef = useRef<CardListPanelRef>(null);

  const { activeCardTag, selectCategory, viewMode } = useCardsManagementStore(
    useShallow((state) => {
      return {
        activeCardTag: state.activeCardTag,
        selectCategory: state.selectCategory,
        viewMode: state.viewMode,
      };
    }),
  );

  const fetchCards = useMemoizedFn(async () => {
    setLoading(true);
    try {
      const allCards = await getAllCards();
      setCards(allCards);
    } catch (error) {
      console.error("Failed to fetch cards:", error);
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    if (isConnected && database) {
      fetchCards();
    }
  }, [fetchCards, isConnected, database]);

  const handleSelectCategoryChange = useMemoizedFn(
    (category: ECardCategory) => {
      useCardsManagementStore.setState({
        selectCategory: category,
      });
    },
  );

  const handleClickTag = useMemoizedFn((tag: string) => {
    useCardsManagementStore.setState({
      activeCardTag: tag === activeCardTag ? "" : tag,
    });
    // 点击标签后滚动到顶部
    cardListRef.current?.scrollToTop();
  });

  const handleCreateCard = useMemoizedFn(async (card: ICreateCard) => {
    try {
      const newCard = await createCard(card);
      // 直接更新本地cards状态，不需要重新获取
      setCards((prevCards) => [...prevCards, newCard]);
    } catch (error) {
      console.error("Failed to create card:", error);
    }
  });

  const handleCardClick = useMemoizedFn((cardId: number) => {
    navigate(`/cards/detail/${cardId}`);
  });

  const handleImportMarkdown = useMemoizedFn(async () => {
    const filePath = await selectFile({
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Markdown",
          extensions: ["md", "markdown"],
        },
      ],
    });
    if (!filePath) return;
    for (const path of filePath) {
      const markdown = await readTextFile(path);
      const content = importFromMarkdown(markdown);
      const newCard: ICreateCard = {
        content,
        tags: [],
        links: [],
        category: selectCategory,
        count: getContentLength(content),
      };
      await handleCreateCard(newCard);
    }
  });

  const handleDeleteCard = useMemoizedFn(async (cardId: number) => {
    try {
      await deleteCard(cardId);
      setCards((prevCards) => prevCards.filter((card) => card.id !== cardId));
    } catch (error) {
      console.error("Failed to delete card:", error);
    }
  });

  const handleUpdateCardCategory = useMemoizedFn(
    async (card: ICard, category: ECardCategory) => {
      try {
        const updatedCard = await updateCard({
          ...card,
          category,
        });
        setCards((prevCards) =>
          prevCards.map((c) => (c.id === updatedCard.id ? updatedCard : c)),
        );
      } catch (error) {
        console.error("Failed to update card category:", error);
      }
    },
  );

  const handleSaveCard = useMemoizedFn(
    async (content: Descendant[], tags: string[]) => {
      const card: ICreateCard = {
        content,
        tags,
        links: [],
        category: selectCategory,
        count: 0,
      };
      await handleCreateCard(card);
      setIsCreatingCard(false);
    },
  );

  const filterCards = useMemoizedFn(
    (cards: ICard[], selectCategory: ECardCategory, activeCardTag: string) => {
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
    },
  );

  const filteredCards = useMemo(() => {
    return filterCards(cards, selectCategory, activeCardTag);
  }, [cards, selectCategory, activeCardTag]);

  const handleMoreClick = useMemoizedFn(async ({ key }: { key: string }) => {
    if (key === "create-card") {
      setIsCreatingCard(true);
    } else if (key === "import-markdown") {
      handleImportMarkdown();
    }
  });

  const titlebarMenuItems: MenuProps["items"] = [
    {
      label: "创建卡片",
      key: "create-card",
    },
    {
      label: "导入卡片",
      key: "import-markdown",
    },
  ];

  // 面包屑导航
  const breadcrumbItems = [
    { title: "首页", path: "/" },
    { title: "卡片列表", path: "/cards/list" },
  ];

  if (loading) {
    return (
      <div className={styles.loading}>
        <LoadingOutlined style={{ fontSize: 24 }} spin />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.list}>
        <div className={styles.cards}>
          <CardTreePanel
            cards={cards}
            activeCardTag={activeCardTag}
            onClickTag={handleClickTag}
          />
          <div className={styles.rightContent}>
            <Titlebar className={styles.titlebar}>
              <Breadcrumb
                className={styles.breadcrumb}
                items={breadcrumbItems.map((item) => ({
                  title: (
                    <span
                      className={styles.breadcrumbItem}
                      onClick={() => navigate(item.path)}
                    >
                      {item.title}
                    </span>
                  ),
                }))}
              />
            </Titlebar>
            {viewMode === ViewMode.List ? (
              <CardListPanel
                ref={cardListRef}
                cards={filteredCards}
                selectCategory={selectCategory}
                onSelectCategoryChange={handleSelectCategoryChange}
                onCreateCard={handleCreateCard}
                onImportMarkdown={handleImportMarkdown}
                onCardClick={handleCardClick}
                onDeleteCard={handleDeleteCard}
                onUpdateCardCategory={handleUpdateCardCategory}
              />
            ) : (
              <div className={styles.graphContainer}>
                <CardGraph
                  cards={filteredCards}
                  onClickCard={handleCardClick}
                  className={styles.cardGraph}
                  fitViewPadding={filteredCards.length > 20 ? [40] : [200]}
                />
              </div>
            )}
            <CreateCard
              className={styles.createCard}
              visible={isCreatingCard}
              onSave={handleSaveCard}
              onCancel={() => setIsCreatingCard(false)}
            />
            <FloatButton.Group
              style={{
                position: "absolute",
                right: 30,
                bottom: 30,
              }}
            >
              <FloatButton
                icon={
                  <Dropdown
                    trigger={["hover"]}
                    menu={{
                      items: Object.keys(cardCategoryName).map((key) => ({
                        label: cardCategoryName[key as ECardCategory],
                        key: key,
                        disabled: selectCategory === (key as ECardCategory),
                      })),
                      onClick: ({ key }) => {
                        useCardsManagementStore.setState({
                          selectCategory: key as ECardCategory,
                        });
                      },
                    }}
                  >
                    <BiCategory />
                  </Dropdown>
                }
              ></FloatButton>
              <FloatButton
                tooltip={
                  viewMode === ViewMode.List ? "前往图谱模式" : "前往列表模式"
                }
                icon={
                  viewMode === ViewMode.List ? (
                    <UnorderedListOutlined />
                  ) : (
                    <PiGraphLight />
                  )
                }
                onClick={() => {
                  useCardsManagementStore.setState({
                    viewMode:
                      viewMode === ViewMode.List
                        ? ViewMode.Graph
                        : ViewMode.List,
                  });
                }}
              />
              <FloatButton
                icon={
                  <Dropdown
                    menu={{
                      items: titlebarMenuItems,
                      onClick: handleMoreClick,
                    }}
                  >
                    <PlusOutlined />
                  </Dropdown>
                }
              />
            </FloatButton.Group>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CardListView;
