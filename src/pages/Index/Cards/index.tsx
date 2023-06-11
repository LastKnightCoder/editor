import { useEffect, useRef } from "react";
import Editor, { EditorRef } from "@/pages/Editor";
import { Descendant } from "slate";
import { Button } from "antd";

import CardItem from "./CardItem";
import useCardsManagementStore from "./hooks/useCardsManagementStore";
import styles from './index.module.less';

const Cards = () => {
  const { cards, init, createOrUpdateCard, editingCard, updateEditingCard } = useCardsManagementStore((state) => ({
    cards: state.cards,
    init: state.init,
    createOrUpdateCard: state.createOrUpdateCard,
    editingCard: state.editingCard,
    updateEditingCard: state.updateEditingCard,
  }));

  const editorRef = useRef<EditorRef>(null);

  useEffect(() => {
    init(editorRef).then();
  }, [init]);

  const handleOnChange = (value: Descendant[]) => {
    updateEditingCard({
      content: value,
    });
  }

  return (
    <div className={styles.cardsManagement}>
      <div className={styles.editorContainer}>
        <div className={styles.editor} onClick={(e) => {e.preventDefault()}}>
          <Editor ref={editorRef} initValue={editingCard.content} readonly={false} onChange={handleOnChange} />
        </div>
        <div className={styles.footer}>
          <Button
            className={styles.btn}
            type="primary"
            onClick={createOrUpdateCard}
          >
            { editingCard.id ? '更新' : '创建' }
          </Button>
        </div>
      </div>
      <div className={styles.cardList}>
        {
          cards.map((card) => <CardItem key={card.id} card={card} />)
        }
      </div>
    </div>
  )
}

export default Cards;