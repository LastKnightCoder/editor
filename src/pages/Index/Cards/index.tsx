import {useEffect, useRef, useState} from "react";
import useCardsManagementStore from "./hooks/useCardsManagementStore";

import styles from './index.module.less';
import CardItem from "@/pages/Index/Cards/CardItem";
import Editor, { EditorRef } from "@/pages/Editor";
import {Descendant} from "slate";
import {Button} from "antd";

const emptyContent: Descendant[] = [{
  type: 'paragraph',
  children: [{ type: 'formatted', text: '' }],
}]

const Cards = () => {
  const { cards, init, addNewCard } = useCardsManagementStore((state) => ({
    cards: state.cards,
    init: state.init,
    addNewCard: state.addNewCard,
  }));

  const [editingValue, setEditingValue] = useState<Descendant[]>(() => {
    const value =  JSON.parse(localStorage.getItem('editingValue') || '[]');
    if (value.length === 0) {
      return emptyContent;
    } else {
      return value;
    }
  });

  const editorRef = useRef<EditorRef>(null);

  useEffect(() => {
    init();
  }, [init]);

  const handleOnChange = (value: Descendant[]) => {
    setEditingValue(value);
    localStorage.setItem('editingValue', JSON.stringify(value));
  }

  const handleInsertCard = async () => {
    await addNewCard({
      content: JSON.stringify(editingValue),
      tags: '',
    });
    if (editorRef.current) {
      editorRef.current.clear();
    }
  }

  return (
    <div className={styles.cardsManagement}>
      <div className={styles.editor}>
        <Editor ref={editorRef} initValue={editingValue} readonly={false} onChange={handleOnChange} />
        <Button type={'primary'} onClick={handleInsertCard}>新增</Button>
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