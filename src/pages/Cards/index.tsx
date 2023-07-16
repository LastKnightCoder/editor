import {useEffect, useMemo, useState} from "react";
import {Button, Input} from 'antd';
import { useNavigate } from 'react-router-dom';

import ErrorBoundary from "@/components/ErrorBoundary";
import { useEditorSourceValueStore } from "@/pages/Cards/hooks/useEditorSourceValueStore.ts";
import EditorSourceValue from "@/components/EditorSourceValue";
import Tags from "@/components/Tags";

import CardItem from "./CardItem";
import useCardsManagementStore from "./hooks/useCardsManagementStore";
import styles from './index.module.less';

const Cards = () => {
  const {
    cards,
    init,
  } = useCardsManagementStore((state) => ({
    cards: state.cards,
    init: state.init,
  }));

  const {
    sourceViewOpen,
    close,
    content
  } = useEditorSourceValueStore((state) => ({
    sourceViewOpen: state.isOpen,
    close: state.close,
    content: state.content,
  }));

  const [searchValue, setSearchValue] = useState<string>('');
  const [searchTags, setSearchTags] = useState<string[]>([]);

  const navigate = useNavigate();

  const filterCards = useMemo(() => {
    if (searchTags.length === 0) return cards;
    return cards.filter(card => {
      return searchTags.every(t => card.tags.some(tag => tag.toLowerCase().includes(t.toLowerCase())));
    })
  }, [cards, searchTags]);

  const onSearch = () => {
    if (searchValue === '') return;
    setSearchTags([...searchTags, searchValue]);
    setSearchValue('');
  }

  const createCard = () => {
    navigate('/cards/detail')
  }

  const deleteTag = (tag: string) => {
    setSearchTags(searchTags.filter(t => t !== tag));
  }

  useEffect(() => {
    init().then();
  }, [init]);

  return (
    <div className={styles.cardsManagement}>
      <div className={styles.header}>
        <div>
          总数：{filterCards.length}
        </div>
        <Input
          style={{ width: 400 }}
          prefix={searchTags.length > 0 ? <Tags closable tags={searchTags} onClose={deleteTag} /> : undefined}
          onPressEnter={onSearch}
          value={searchValue}
          onChange={(e) => { setSearchValue(e.target.value) }}
          className={styles.input}
          placeholder="输入标签进行筛选"
        />
        <Button className={styles.addCard} onClick={createCard}>新建卡片</Button>
      </div>
      <div className={styles.cardList}>
        {
          filterCards.slice(0, 20).map((card) => <ErrorBoundary key={card.id}><CardItem key={card.id} card={card} /></ErrorBoundary>)
        }
      </div>
      <EditorSourceValue open={sourceViewOpen} onClose={close} content={content} />
    </div>
  )
}

export default Cards;
