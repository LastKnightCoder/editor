import { useEffect } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import EditCardModal from "./EditCardModal";
import AddCardLinkModal from "./AddCardLinkModal";
import CardItem from "./CardItem";
import useCardsManagementStore from "./hooks/useCardsManagementStore";
import styles from './index.module.less';
import useEditCardStore from "./hooks/useEditCardStore.ts";
import { Button } from 'antd';
import {useEditorSourceValueStore} from "@/pages/Cards/hooks/useEditorSourceValueStore.ts";
import EditorSourceValue from "@/components/EditorSourceValue";

const Cards = () => {
  const {
    cards,
    init,
  } = useCardsManagementStore((state) => ({
    cards: state.cards,
    init: state.init,
  }));

  const { openModal } = useEditCardStore((state) => ({
    openModal: state.openEditableModal,
  }));

  const {
    sourceViewOpen,
    close,
    content
  } = useEditorSourceValueStore((state) => ({
    sourceViewOpen: state.isOpen,
    close: state.close,
    content: state.content,
  }))

  const handleClickCreate = () => {
    openModal(undefined, true);
  }

  useEffect(() => {
    init().then();
  }, [init]);

  return (
    <div className={styles.cardsManagement}>
      <div className={styles.sidebar}>
        <Button className={styles.addCard} onClick={handleClickCreate}>新建卡片</Button>
      </div>
      <div className={styles.cardList}>
        {
          cards.map((card) => <ErrorBoundary key={card.id}><CardItem key={card.id} card={card} /></ErrorBoundary>)
        }
      </div>
      <EditCardModal />
      <AddCardLinkModal />
      <EditorSourceValue open={sourceViewOpen} onClose={close} content={content} />
    </div>
  )
}

export default Cards;
