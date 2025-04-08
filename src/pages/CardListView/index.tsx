import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMemoizedFn } from "ahooks";
import { Breadcrumb, Dropdown, MenuProps, FloatButton, App } from "antd";
import { Descendant } from "slate";

import {
  LoadingOutlined,
  PlusOutlined,
  UnorderedListOutlined,
  UpOutlined,
} from "@ant-design/icons";
import { PiGraphLight } from "react-icons/pi";
import { BiCategory } from "react-icons/bi";

import useCardsManagementStore, {
  ViewMode,
} from "@/stores/useCardsManagementStore";
import { useShallow } from "zustand/react/shallow";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";

import CardTreePanel from "./CardTreePanel";
import CardListPanel, { CardListPanelRef } from "./CardListPanel";
import CardGraph from "./CardGraph";
import CreateCard from "./CreateCard";
import CardPreview from "./CardPreview";
import If from "@/components/If";
import PresentationMode from "@/components/PresentationMode";
import Titlebar from "@/components/Titlebar";

import { ICard, ECardCategory, ICreateCard } from "@/types";
import { cardCategoryName } from "@/constants";
import { getContentLength, importFromMarkdown } from "@/utils";
import {
  getAllCards,
  createCard,
  deleteCard,
  updateCard,
  readTextFile,
  selectFile,
} from "@/commands";

import styles from "./index.module.less";

const CardListView = () => {
  const navigate = useNavigate();
  const [cards, setCards] = useState<ICard[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreatingCard, setIsCreatingCard] = useState(false);
  const [previewCardId, setPreviewCardId] = useState<number | undefined>(
    undefined,
  );
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const { modal } = App.useApp();
  const isConnected = useDatabaseConnected();
  const database = useSettingStore((state) => state.setting.database.active);

  const cardListRef = useRef<CardListPanelRef>(null);

  const {
    activeCardTag,
    selectCategory,
    viewMode,
    presentationCard,
    startPresentation,
    stopPresentation,
  } = useCardsManagementStore(
    useShallow((state) => {
      return {
        activeCardTag: state.activeCardTag,
        selectCategory: state.selectCategory,
        viewMode: state.viewMode,
        presentationCard: state.presentationCard,
        startPresentation: state.startPresentation,
        stopPresentation: state.stopPresentation,
      };
    }),
  );

  // 计算排序后的卡片
  const sortedCards = useMemo(() => {
    return [...cards].sort((a, b) => {
      // 首先按照置顶状态排序
      if (a.isTop && !b.isTop) return -1;
      if (!a.isTop && b.isTop) return 1;
      // 如果置顶状态相同，则按照创建时间降序排序
      if (a.isTop === b.isTop) {
        return b.create_time - a.create_time;
      }
      return 0;
    });
  }, [cards]);

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
      setCards((prevCards) => [newCard, ...prevCards]);
    } catch (error) {
      console.error("Failed to create card:", error);
    }
  });

  const handleCardClick = useMemoizedFn((card: ICard) => {
    setPreviewCardId(card.id);
    setIsPreviewVisible(true);
  });

  const handleClosePreview = useMemoizedFn(() => {
    setIsPreviewVisible(false);
    setPreviewCardId(undefined);
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
      const content = importFromMarkdown(markdown, ["yaml"]);
      const newCard: ICreateCard = {
        content,
        tags: [],
        links: [],
        category: selectCategory,
        count: getContentLength(content),
        isTop: false,
      };
      await handleCreateCard(newCard);
    }
  });

  const handleCardChange = useMemoizedFn((card: ICard) => {
    setCards((prevCards) =>
      prevCards.map((c) => (c.id === card.id ? card : c)),
    );
  });

  const handleDeleteCard = useMemoizedFn(async (cardId: number) => {
    try {
      modal.confirm({
        title: "删除卡片",
        content: "确定要删除该卡片吗？",
        okText: "确定",
        cancelText: "取消",
        okButtonProps: {
          danger: true,
        },
        onOk: async () => {
          await deleteCard(cardId);
          setCards((prevCards) =>
            prevCards.filter((card) => card.id !== cardId),
          );
        },
      });
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

  const handleToggleCardTop = useMemoizedFn(async (cardId: number) => {
    try {
      const card = cards.find((c) => c.id === cardId);
      if (!card) return;

      const updatedCard = await updateCard({
        ...card,
        isTop: !card.isTop,
      });

      setCards((prevCards) =>
        prevCards.map((c) => (c.id === updatedCard.id ? updatedCard : c)),
      );
    } catch (error) {
      console.error("Failed to toggle card top:", error);
    }
  });

  const handleSaveCard = useMemoizedFn(
    async (content: Descendant[], tags: string[]) => {
      const card: ICreateCard = {
        content,
        tags,
        links: [],
        category: selectCategory,
        count: 0,
        isTop: false,
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
    return filterCards(sortedCards, selectCategory, activeCardTag);
  }, [sortedCards, selectCategory, activeCardTag, filterCards]);

  const handleMoreClick = useMemoizedFn(async ({ key }: { key: string }) => {
    if (key === "create-card") {
      setIsCreatingCard(true);
    } else if (key === "import-markdown") {
      handleImportMarkdown();
    }
  });

  const handlePresentationMode = useMemoizedFn((card: ICard) => {
    startPresentation(card);
  });

  const titlebarMenuItems: MenuProps["items"] = useMemo(() => {
    return [
      {
        label: "创建卡片",
        key: "create-card",
      },
      {
        label: "导入卡片",
        key: "import-markdown",
      },
    ];
  }, []);

  const breadcrumbItems = useMemo(() => {
    return [
      { title: "首页", path: "/" },
      { title: "卡片列表", path: "/cards/list" },
    ];
  }, []);

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
            cards={sortedCards}
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
                onToggleCardTop={handleToggleCardTop}
                onCardChange={handleCardChange}
                onShowScrollToTop={setShowScrollToTop}
                onPresentationMode={handlePresentationMode}
              />
            ) : (
              <div className={styles.graphContainer}>
                <CardGraph
                  cards={sortedCards}
                  onClickCard={handleCardClick}
                  className={styles.cardGraph}
                  currentCardIds={filteredCards.map((card) => card.id)}
                />
              </div>
            )}
            <CreateCard
              className={styles.createCard}
              visible={isCreatingCard}
              onSave={handleSaveCard}
              onCancel={() => setIsCreatingCard(false)}
            />
            <CardPreview
              key={previewCardId}
              cardId={previewCardId}
              visible={isPreviewVisible}
              onClose={handleClosePreview}
            />
            {!!presentationCard && (
              <PresentationMode
                content={presentationCard.content}
                onExit={() => {
                  stopPresentation();
                }}
              />
            )}
            <If condition={!presentationCard}>
              <FloatButton.Group
                style={{
                  position: "absolute",
                  right: 30,
                  bottom: 30,
                }}
              >
                <If condition={showScrollToTop && viewMode === ViewMode.List}>
                  <FloatButton
                    className={styles.floatButton}
                    icon={<UpOutlined />}
                    tooltip={"回到顶部"}
                    onClick={() => {
                      cardListRef.current?.scrollToTop();
                    }}
                  />
                </If>
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
                  tooltip={viewMode === ViewMode.List ? "列表模式" : "图谱模式"}
                  icon={
                    viewMode === ViewMode.List ? (
                      <PiGraphLight />
                    ) : (
                      <UnorderedListOutlined />
                    )
                  }
                  onClick={() => {
                    setShowScrollToTop(false);
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
            </If>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CardListView;
