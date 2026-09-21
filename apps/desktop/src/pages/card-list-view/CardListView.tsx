import { useEffect, useMemo, useRef, useState } from "react";
import { useCreation, useMemoizedFn } from "ahooks";
import { Dropdown, MenuProps, FloatButton, App } from "antd";
import { Descendant } from "slate";
import { LoadingOutlined, PlusOutlined, UpOutlined, CaretDownOutlined } from "@ant-design/icons";

import useCardsManagementStore, { ViewMode } from "@/stores/useCardsManagementStore";
import { useShallow } from "zustand/react/shallow";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";

import CardTreePanel from "./CardTreePanel";
import CardListPanel, { CardListPanelRef } from "./CardListPanel";
import CardGraph from "./CardGraph";
import CardDatabaseView, { CardDatabaseViewRef } from "@/components/CardDatabaseView";
import CreateCard from "./CreateCard";
import CardPreview from "./CardPreview";
import If from "@/components/If";
import PresentationMode from "@/components/PresentationMode";
import { ICard, ECardCategory, ICreateCard } from "@/types";
import { cardCategoryName } from "@/constants";
import { getContentLength, importFromMarkdown, defaultCardEventBus, searchContent } from "@/utils";
import {
  getAllCards,
  createCard,
  deleteCard,
  updateCard,
  readTextFile,
  selectFile,
} from "@/commands";
import classNames from "classnames";
import { useThemeColors } from "@/hooks";
import SearchInput from "@/components/SearchInput";
import useSettingStore from "@/stores/useSettingStore";
import { resolveEmbeddingModelInfoFromSetting } from "@/utils/embedding-model-info";

const categoryWithAll = {
  all: "全部笔记",
  ...cardCategoryName,
};

const CARD_SEARCH_LIMIT = 200;

const CardListView = () => {
  const [cards, setCards] = useState<ICard[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreatingCard, setIsCreatingCard] = useState(false);
  const [previewCardId, setPreviewCardId] = useState<number | undefined>(undefined);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [pendingCardCategory, setPendingCardCategory] = useState<ECardCategory | null>(null);
  const [cardSearchQuery, setCardSearchQuery] = useState("");
  const [searchedCardIds, setSearchedCardIds] = useState<Set<number> | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const { modal } = App.useApp();
  const cardDatabaseViewRef = useRef<CardDatabaseViewRef>(null);
  const searchRequestIdRef = useRef(0);
  const { hoverClass, activeClass, borderClass, buttonBg, buttonTextClass } = useThemeColors();

  const cardEventBus = useCreation(() => {
    return defaultCardEventBus.createEditor();
  }, []);

  useEffect(() => {
    const unsubscribeCreated = cardEventBus.subscribeToOtherEditors("card:created", data => {
      if (cards.find(c => c.id === data.card.id)) return;
      setCards(prevCards => [data.card, ...prevCards]);
    });
    const unsubscribeUpdated = cardEventBus.subscribeToOtherEditors("card:updated", data => {
      const updatedCard = data.card;
      setCards(prevCards => prevCards.map(c => (c.id === updatedCard.id ? updatedCard : c)));
    });

    return () => {
      unsubscribeCreated();
      unsubscribeUpdated();
    };
  }, []);

  const cardListRef = useRef<CardListPanelRef>(null);

  const {
    activeCardTag,
    selectCategory,
    viewMode,
    presentationCard,
    startPresentation,
    stopPresentation,
  } = useCardsManagementStore(
    useShallow(state => {
      return {
        activeCardTag: state.activeCardTag,
        selectCategory: state.selectCategory,
        viewMode: state.viewMode,
        presentationCard: state.presentationCard,
        startPresentation: state.startPresentation,
        stopPresentation: state.stopPresentation,
      };
    })
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

  // 在数据库连接或切换时加载卡片数据
  useDatabaseChangeEffect(() => {
    fetchCards();
  });

  const handleClickTag = useMemoizedFn((tag: string) => {
    useCardsManagementStore.setState({
      activeCardTag: tag === activeCardTag ? "" : tag,
    });
    // 点击标签后滚动到顶部
    cardListRef.current?.scrollToTop();
  });

  const handleSearchCards = useMemoizedFn(async (query: string) => {
    setCardSearchQuery(query);

    const trimmedQuery = query.trim();
    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;

    if (!trimmedQuery) {
      setSearchedCardIds(null);
      setIsSearching(false);
      cardListRef.current?.scrollToTop();
      return;
    }

    setIsSearching(true);
    try {
      const settings = useSettingStore.getState().setting;
      const modelInfo = resolveEmbeddingModelInfoFromSetting(settings);
      const results = await searchContent({
        query: trimmedQuery,
        types: ["card"],
        limit: CARD_SEARCH_LIMIT,
        ...(modelInfo ? { modelInfo } : {}),
      });

      if (searchRequestIdRef.current !== requestId) return;

      setSearchedCardIds(new Set(results.map(result => result.id)));
      cardListRef.current?.scrollToTop();
    } catch (error) {
      if (searchRequestIdRef.current !== requestId) return;
      console.error("Failed to search cards:", error);
      setSearchedCardIds(new Set());
    } finally {
      if (searchRequestIdRef.current === requestId) {
        setIsSearching(false);
      }
    }
  });

  const handleCreateCard = useMemoizedFn(async (card: ICreateCard) => {
    try {
      const newCard = await createCard(card);
      setCards(prevCards => [newCard, ...prevCards]);
      // 如果是数据库视图，手动添加行
      if (viewMode === ViewMode.Database) {
        cardDatabaseViewRef.current?.addCardRow(newCard);
      }
      cardEventBus.publishCardEvent("card:created", newCard);
    } catch (error) {
      console.error("Failed to create card:", error);
    }
  });

  const handleCardClick = useMemoizedFn((card: ICard) => {
    setPreviewCardId(card.id);
    setIsPreviewVisible(true);
  });

  const handleClosePreview = useMemoizedFn(async () => {
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
        category:
          selectCategory === ("all" as unknown as ECardCategory)
            ? ECardCategory.Temporary
            : selectCategory,
        count: getContentLength(content),
        isTop: false,
      };
      await handleCreateCard(newCard);
    }
  });

  const handleDeleteCard = useMemoizedFn(async (cardId: number): Promise<void> => {
    return new Promise((resolve, reject) => {
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
            setCards(prevCards => prevCards.filter(card => card.id !== cardId));
            resolve();
          },
          onCancel: () => {
            reject(new Error("取消删除卡片"));
          },
        });
      } catch (error) {
        console.error("Failed to delete card:", error);
        reject(error);
      }
    });
  });

  const handleUpdateCardCategory = useMemoizedFn(async (card: ICard, category: ECardCategory) => {
    try {
      const updatedCard = await updateCard({
        ...card,
        category,
      });
      setCards(prevCards => prevCards.map(c => (c.id === updatedCard.id ? updatedCard : c)));
      cardEventBus.publishCardEvent("card:updated", updatedCard);
    } catch (error) {
      console.error("Failed to update card category:", error);
    }
  });

  const handleToggleCardTop = useMemoizedFn(async (cardId: number) => {
    try {
      const card = cards.find(c => c.id === cardId);
      if (!card) return;

      const updatedCard = await updateCard({
        ...card,
        isTop: !card.isTop,
      });

      setCards(prevCards => prevCards.map(c => (c.id === updatedCard.id ? updatedCard : c)));
      cardEventBus.publishCardEvent("card:updated", updatedCard);
    } catch (error) {
      console.error("Failed to toggle card top:", error);
    }
  });

  const handleSaveCard = useMemoizedFn(async (content: Descendant[], tags: string[]) => {
    const category =
      pendingCardCategory ||
      (selectCategory === ("all" as unknown as ECardCategory)
        ? ECardCategory.Temporary
        : selectCategory);

    const card: ICreateCard = {
      content,
      tags,
      links: [],
      category,
      count: 0,
      isTop: false,
    };
    await handleCreateCard(card);
    setIsCreatingCard(false);
    setPendingCardCategory(null);
  });

  const filterCards = useMemoizedFn(
    (cards: ICard[], selectCategory: ECardCategory, activeCardTag: string) => {
      const cardWithCategory = cards.filter(card => {
        return (
          card.category === selectCategory || selectCategory === ("all" as unknown as ECardCategory)
        );
      });

      if (!activeCardTag) return cardWithCategory;
      return cardWithCategory.filter(card =>
        card.tags.some(tag => {
          const activeCardTags = activeCardTag.split("/");
          const tags = tag.split("/");
          if (tags.length < activeCardTags.length) return false;
          for (let i = 0; i < activeCardTags.length; i++) {
            if (activeCardTags[i] !== tags[i]) return false;
          }
          return true;
        })
      );
    }
  );

  const filteredCards = useMemo(() => {
    const tagAndCategoryFilteredCards = filterCards(sortedCards, selectCategory, activeCardTag);

    if (!cardSearchQuery.trim() || !searchedCardIds) {
      return tagAndCategoryFilteredCards;
    }

    const cardById = new Map(tagAndCategoryFilteredCards.map(card => [card.id, card]));

    return Array.from(searchedCardIds)
      .map(cardId => cardById.get(cardId))
      .filter((card): card is ICard => Boolean(card));
  }, [sortedCards, selectCategory, activeCardTag, filterCards, cardSearchQuery, searchedCardIds]);

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

  const viewModeMenuItems = useMemo(() => {
    return [
      {
        label: "列表",
        key: ViewMode.List,
        onClick: () => {
          setShowScrollToTop(false);
          useCardsManagementStore.setState({
            viewMode: ViewMode.List,
          });
        },
      },
      {
        label: "关系图谱",
        key: ViewMode.Graph,
        onClick: () => {
          setShowScrollToTop(false);
          useCardsManagementStore.setState({
            viewMode: ViewMode.Graph,
          });
        },
      },
      {
        label: "数据库",
        key: ViewMode.Database,
        onClick: () => {
          setShowScrollToTop(false);
          useCardsManagementStore.setState({
            viewMode: ViewMode.Database,
          });
        },
      },
      // {
      //   label: "时间线",
      //   key: ViewMode.Timeline,
      //   onClick: () => {
      //     setShowScrollToTop(false);
      //     useCardsManagementStore.setState({
      //       viewMode: ViewMode.Timeline,
      //     });
      //   },
      // },
    ];
  }, []);

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

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <LoadingOutlined style={{ fontSize: 24 }} spin />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex h-full w-full flex-col overflow-hidden">
        <div className="flex h-full w-full overflow-hidden">
          <CardTreePanel
            cards={sortedCards}
            activeCardTag={activeCardTag}
            onClickTag={handleClickTag}
          />
          <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
            <div className="mt-3 flex h-10 shrink-0 items-center justify-between px-10">
              <div className="flex h-full items-center gap-2 rounded-full px-4">
                {viewModeMenuItems.map(item => (
                  <div
                    key={item.key}
                    className={classNames(
                      "flex h-full cursor-pointer items-center rounded-full px-3 transition-all",
                      {
                        [activeClass]: viewMode === item.key,
                        [hoverClass]: viewMode !== item.key,
                      }
                    )}
                    onClick={item.onClick}
                  >
                    {item.label}
                  </div>
                ))}
              </div>
              <div className="flex flex-1 justify-end px-3">
                <SearchInput
                  value={cardSearchQuery}
                  onChange={handleSearchCards}
                  placeholder="搜索卡片..."
                />
              </div>
              <div className="mr-3 flex h-10 items-center gap-3">
                <Dropdown
                  trigger={["click"]}
                  menu={{
                    items: Object.keys(categoryWithAll).map(key => ({
                      label: categoryWithAll[key as ECardCategory],
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
                  <div
                    className={classNames(
                      "flex h-10 cursor-pointer items-center gap-3 rounded-full border px-3 py-1 transition-all",
                      borderClass,
                      hoverClass
                    )}
                  >
                    <span>{categoryWithAll[selectCategory as ECardCategory]}</span>
                    <CaretDownOutlined />
                  </div>
                </Dropdown>
                <div
                  className={classNames(
                    "flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-all",
                    buttonBg,
                    buttonTextClass
                  )}
                >
                  <Dropdown
                    trigger={["click"]}
                    menu={{
                      items: titlebarMenuItems,
                      onClick: handleMoreClick,
                    }}
                  >
                    <PlusOutlined />
                  </Dropdown>
                </div>
              </div>
            </div>
            <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
              <If condition={viewMode === ViewMode.List}>
                <CardListPanel
                  ref={cardListRef}
                  cards={filteredCards}
                  onCardClick={handleCardClick}
                  onDeleteCard={handleDeleteCard}
                  onUpdateCardCategory={handleUpdateCardCategory}
                  onToggleCardTop={handleToggleCardTop}
                  onShowScrollToTop={setShowScrollToTop}
                  onPresentationMode={handlePresentationMode}
                  emptyDescription={
                    isSearching
                      ? "搜索中..."
                      : cardSearchQuery.trim()
                        ? "没有匹配的卡片"
                        : "暂无卡片"
                  }
                />
              </If>
              <If condition={viewMode === ViewMode.Graph}>
                <CardGraph
                  initCards={sortedCards}
                  onClickCard={handleCardClick}
                  className="h-full w-full"
                  enableHoverPreview={!isPreviewVisible}
                  currentCardIds={filteredCards.map(card => card.id)}
                />
              </If>
              <If condition={viewMode === ViewMode.Database}>
                <CardDatabaseView
                  ref={cardDatabaseViewRef}
                  cards={sortedCards}
                  tag={activeCardTag}
                  searchResults={cardSearchQuery.trim() ? searchedCardIds : null}
                  selectCategory={selectCategory}
                  onCardClick={handleCardClick}
                  onOpenCreateCard={defaultCategory => {
                    setPendingCardCategory(defaultCategory);
                    setIsCreatingCard(true);
                  }}
                  onDeleteCard={handleDeleteCard}
                />
              </If>
              <CreateCard
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
                      icon={<UpOutlined />}
                      tooltip={"回到顶部"}
                      onClick={() => {
                        cardListRef.current?.scrollToTop();
                      }}
                    />
                  </If>
                </FloatButton.Group>
              </If>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CardListView;
