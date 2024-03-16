import { memo, useEffect, useMemo, useState } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { useMemoizedFn } from "ahooks";

import Sidebar from './Sidebar';
import Titlebar from "./Titlebar";
import CardList from './List/Card';
import ArticleList from "./List/ArticleList";
import CardContent from './Content/Card';
import ArticleContent from './Content/Article';

import useCardsManagementStore from "@/stores/useCardsManagementStore";
import useArticleManagementStore from "@/stores/useArticleManagementStore";
import useCardManagement from "@/hooks/useCardManagement";

import { DEFAULT_ARTICLE_CONTENT } from "@/constants";
import { ECardCategory, IArticle } from "@/types";

import styles from './index.module.less';
import If from "@/components/If";

const ClassicLayout = memo(() => {
  const [activeArticleId, setActiveArticleId] = useState<number | undefined>(undefined);

  const location = useLocation();
  const navigate = useNavigate();
  
  useEffect(() => {
    // 如果当前路是 /，重定向到 /cards/
    if (location.pathname === '/') {
      navigate('/cards');
    }
  }, [location, navigate])
  
  const {
    leftCardIds,
    rightCardIds,
    leftActiveCardId,
    rightActiveCardId,
    onCreateCard,
    onDeleteCard,
    onClickCard,
    onClickTab,
    onCloseTab,
    onMoveCard,
    onCloseOtherTabs,
  } = useCardManagement();

  const { cards, selectCategory, updateCard } = useCardsManagementStore((state) => ({
    cards: state.cards,
    selectCategory: state.selectCategory,
    updateCard: state.updateCard,
  }));

  const onSelectCategoryChange = useMemoizedFn((category: ECardCategory) => {
    useCardsManagementStore.setState({
      selectCategory: category,
    })
  })

  const cardsWithCategory = useMemo(() => {
    return cards.filter((card) => {
      return card.category === selectCategory;
    })
  }, [cards, selectCategory]);

  const {
    articles,
    createArticle
  } = useArticleManagementStore((state) => ({
    articles: state.articles,
    createArticle: state.createArticle,
  }));

  const handleAddNewArticle = async () => {
    const article = await createArticle({
      title: '默认文章标题',
      content: DEFAULT_ARTICLE_CONTENT,
      bannerBg: '',
      isTop: false,
      author: 'Tao',
      links: [],
      tags: [],
    });
    setActiveArticleId(article.id);
  }

  const handleClickArticle = (article: IArticle) => {
    if (article.id === activeArticleId) {
      setActiveArticleId(undefined);
      return;
    }
    setActiveArticleId(article.id);
  }

  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
        <Sidebar />
      </div>
      <div className={styles.list}>
        <Routes>
          <Route path="/cards/" element={(
            <CardList
              activeCardIds={[leftActiveCardId, rightActiveCardId].filter(Boolean) as number[]}
              onClickCard={onClickCard}
              onCreateCard={onCreateCard}
              onDeleteCard={onDeleteCard}
              updateCard={updateCard}
              cards={cardsWithCategory}
              selectCategory={selectCategory}
              onSelectCategoryChange={onSelectCategoryChange}
            />
          )} />
          <Route path="/articles/" element={(
            <ArticleList
              activeArticleId={activeArticleId}
              articles={articles}
              addArticle={handleAddNewArticle}
              onClickArticle={handleClickArticle}
            />
          )} />
        </Routes>
      </div>
      <div className={styles.contentArea}>
        <div className={styles.titleBar}>
          <Titlebar />
        </div>
        <div className={styles.content}>
          <Routes>
            <Route path="/cards/" element={(
              <CardContent
                leftCardIds={leftCardIds}
                rightCardIds={rightCardIds}
                leftActiveCardId={leftActiveCardId}
                rightActiveCardId={rightActiveCardId}
                onClickCard={onClickCard}
                onClickTab={onClickTab}
                onCloseTab={onCloseTab}
                onMoveCard={onMoveCard}
                onCloseOtherTabs={onCloseOtherTabs}
              />
            )} />
            <Route path="/articles/" element={(
              <If condition={!!activeArticleId}>
                <ArticleContent key={activeArticleId} articleId={activeArticleId!} />
              </If>
            )} />
          </Routes>
        </div>
      </div>
    </div>
  )
});

export default ClassicLayout;