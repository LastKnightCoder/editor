import { useEffect, useRef } from "react";
import { EditorRef } from "@/pages/Editor";
import ErrorBoundary from "@/components/ErrorBoundary";


import CardItem from "./CardItem";
import useCardsManagementStore from "./hooks/useCardsManagementStore";
import styles from './index.module.less';

const Cards = () => {
  const { cards, init } = useCardsManagementStore((state) => ({
    cards: state.cards,
    init: state.init,
  }));

  const editorRef = useRef<EditorRef>(null);

  useEffect(() => {
    init(editorRef).then();
  }, [init]);

  return (
    <div className={styles.cardsManagement}>
      <div className={styles.sidebar}>
        <div>新建卡片</div>
        <div>搜索卡片</div>
        <div>活跃度</div>
      </div>
      <div className={styles.cardList}>
        {
          cards.map((card) => <ErrorBoundary key={card.id}><CardItem key={card.id} card={card} /></ErrorBoundary>)
        }
      </div>
    </div>
  )
}

export default Cards;