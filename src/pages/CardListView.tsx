import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMemoizedFn } from "ahooks";
import { Breadcrumb } from "antd";
import { ICard, ECardCategory, ICreateCard } from "@/types";
import {
  getAllCards,
  createCard,
  deleteCard,
  updateCard,
} from "@/commands/card";
import CardTreePanel from "@/layouts/ShortSidebarLayout/components/CardView/CardTreePanel";
import CardListPanel, {
  CardListPanelRef,
} from "@/layouts/ShortSidebarLayout/components/CardView/CardListPanel";
import Titlebar from "@/layouts/components/Titlebar";
import styles from "./CardListView.module.less";

const CardListView = () => {
  const navigate = useNavigate();
  const [cards, setCards] = useState<ICard[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectCategory, setSelectCategory] = useState<ECardCategory>(
    ECardCategory.Temporary,
  );
  const [activeCardTag, setActiveCardTag] = useState("");
  const cardListRef = useRef<CardListPanelRef>(null);

  useEffect(() => {
    fetchCards();
  }, []);

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

  const handleSelectCategoryChange = useMemoizedFn(
    (category: ECardCategory) => {
      setSelectCategory(category);
    },
  );

  const handleClickTag = useMemoizedFn((tag: string) => {
    setActiveCardTag(tag === activeCardTag ? "" : tag);
    // 点击标签后滚动到顶部
    cardListRef.current?.scrollToTop();
  });

  const handleCreateCard = useMemoizedFn(async (card: ICreateCard) => {
    try {
      await createCard(card);
      fetchCards();
    } catch (error) {
      console.error("Failed to create card:", error);
    }
  });

  const handleCardClick = useMemoizedFn((cardId: number) => {
    navigate(`/cards/detail/${cardId}`);
  });

  const handleImportMarkdown = useMemoizedFn(async () => {
    try {
      // 实现导入功能
      fetchCards();
    } catch (error) {
      console.error("Failed to import markdown:", error);
    }
  });

  const handleDeleteCard = useMemoizedFn(async (cardId: number) => {
    try {
      await deleteCard(cardId);
      fetchCards();
    } catch (error) {
      console.error("Failed to delete card:", error);
    }
  });

  const handleUpdateCardCategory = useMemoizedFn(
    async (card: ICard, category: ECardCategory) => {
      try {
        await updateCard({
          ...card,
          category,
        });
        fetchCards();
      } catch (error) {
        console.error("Failed to update card category:", error);
      }
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

  // 面包屑导航
  const breadcrumbItems = [
    { title: "首页", path: "/" },
    { title: "卡片列表", path: "/cards/list" },
  ];

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
            <Titlebar>
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default CardListView;
