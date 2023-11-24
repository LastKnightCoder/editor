import { useEffect, memo } from "react";

import If from "@/components/If";

import useCardsManagementStore from "@/stores/useCardsManagementStore";
import useEditCardStore from "@/stores/useEditCardStore.ts";

import Sidebar from "./Sidebar";
import EditCard from "./EditCard";

import styles from './index.module.less';

const Cards = memo(() => {
  const {
    init,
  } = useCardsManagementStore((state) => ({
    init: state.init,
  }));
  const {
    editingCardId,                                                                  
  } = useEditCardStore((state) => ({
    editingCardId: state.editingCardId,
  }));

  const onClickLinkCard = async (id: number) => {
    useEditCardStore.setState({
      editingCardId: id,
    });
  }

  useEffect(() => {
    init().then();
  }, [init]);

  return (
    <div className={styles.cardsContainer}>
      <Sidebar />
      <div className={styles.content}>
        <If condition={!!editingCardId}>
          <EditCard key={editingCardId} cardId={editingCardId!} onClickLinkCard={onClickLinkCard} />
        </If>
      </div>
    </div>
  )
})

export default Cards;
