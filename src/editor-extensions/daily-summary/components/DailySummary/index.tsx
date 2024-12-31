import { IExtensionBaseProps } from "@editor/extensions/types.ts";
import { DailySummaryElement } from "@/editor-extensions/daily-summary";
import AddParagraph from "@/components/Editor/components/AddParagraph";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";
import { MdDragIndicator } from "react-icons/md";
import classnames from "classnames";

import styles from "./index.module.less";
import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";
import dayjs from "dayjs";
import CardItem2 from "@/components/CardItem2";
import For from "@/components/For";
import { Empty, Tag } from "antd";
import useCardManagement from "@/hooks/useCardManagement.ts";
import { useNavigate } from "react-router-dom";
import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";
import If from "@/components/If";
import ArticleCard from "@/layouts/components/ArticleCard";

const DailySummary = (props: IExtensionBaseProps<DailySummaryElement>) => {
  const { element, attributes, children } = props;

  const navigate = useNavigate();

  const {
    drag,
    drop,
    isDragging,
    canDrag,
    canDrop,
    isBefore,
    isOverCurrent,
  } = useDragAndDrop({
    // @ts-ignore
    element,
  });

  const { date } = element;

  const { cards } = useCardsManagementStore(state => ({
    cards: state.cards,
  }));
  const { articles } = useArticleManagementStore(state => ({
    articles: state.articles
  }))

  const cardsWithDate = cards.filter(card => dayjs(card.create_time).format('YYYY-MM-DD') === date || dayjs(card.update_time).format('YYYY-MM-DD') === date);
  const articlesWithDate = articles.filter(article => dayjs(article.create_time).format('YYYY-MM-DD') === date || dayjs(article.update_time).format('YYYY-MM-DD') === date);

  cardsWithDate.sort((a, b) => dayjs(b.update_time).valueOf() - dayjs(a.update_time).valueOf());
  articlesWithDate.sort((a, b) => dayjs(b.update_time).valueOf() - dayjs(a.update_time).valueOf());

  const {
    onCtrlClickCard
  } = useCardManagement();

  return (
    <div
      ref={drop}
      className={classnames(styles.dropContainer, {
        [styles.dragging]: isDragging,
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
      })}
    >

      <div className={styles.listContainer} contentEditable={false}>
        <div className={styles.info}>
          <Tag color={'red'}>今日更新笔记：{cardsWithDate.length}</Tag>
        </div>
        <div className={styles.cardList}>
          <For
            data={cardsWithDate}
            renderItem={card => (
              <CardItem2
                key={card.id}
                card={card}
                showLine={false}
                onClick={() => {
                  navigate('/cards/list');
                  onCtrlClickCard(card.id);
                }}
                style={{
                  marginBottom: 0
                }}
              />
            )}
          />
        </div>
        <If condition={cardsWithDate.length === 0}>
          <Empty description={'今日无卡片更新'} />
        </If>
        <div className={styles.info} style={{ marginTop: 16 }}>
          <Tag color={'orange'}>今日更新文章：{articlesWithDate.length}</Tag>
        </div>
        <div className={styles.articleList}>
          <For
            data={articlesWithDate}
            renderItem={(article, index) => (
              <ArticleCard
                key={article.id}
                article={article}
                disableOperation={true}
                imageRight={index % 2 === 0}
              />
            )}
          />
        </div>
        <If condition={articlesWithDate.length === 0}>
          <Empty description={'今日无文章更新'} />
        </If>
      </div>
      <div {...attributes}>
        {children}
      </div>
      <AddParagraph element={element as any}/>
      <div contentEditable={false} ref={drag} className={classnames(styles.dragHandler, { [styles.canDrag]: canDrag })}>
        <MdDragIndicator className={styles.icon}/>
      </div>
    </div>
  )
}

export default DailySummary;
