import {useEffect, useMemo, useState} from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import EditCardModal from "./EditCardModal";
import AddCardLinkModal from "./AddCardLinkModal";
import CardItem from "./CardItem";
import useCardsManagementStore from "./hooks/useCardsManagementStore";
import styles from './index.module.less';
import useEditCardStore from "./hooks/useEditCardStore.ts";
import { Button, Input } from 'antd';
import {useEditorSourceValueStore} from "@/pages/Cards/hooks/useEditorSourceValueStore.ts";
import EditorSourceValue from "@/components/EditorSourceValue";
import Tags from "@/components/Tags";

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
  }));

  const [searchValue, setSearchValue] = useState<string>('');
  const [searchTags, setSearchTags] = useState<string[]>([]);

  const onSearch = () => {
    if (searchValue === '') return;
    setSearchTags([...searchTags, searchValue]);
    setSearchValue('');
  }

  const filterCards = useMemo(() => {
    if (searchValue === '' && searchTags.length === 0) return cards;
    return cards.filter(card => {
      return [...searchTags, searchValue].every(t => card.tags.some(tag => tag.toLowerCase().includes(t.toLowerCase())));
    })
  }, [cards, searchTags, searchValue]);

  const deleteTag = (tag: string) => {
    setSearchTags(searchTags.filter(t => t !== tag));
  }

  const handleClickCreate = () => {
    openModal(undefined, true);
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
          allowClear
          value={searchValue}
          onChange={(e) => { setSearchValue(e.target.value) }}
          className={styles.input}
          placeholder="输入标签进行筛选"
        />
        <Button className={styles.addCard} onClick={handleClickCreate}>新建卡片</Button>
      </div>
      <div className={styles.cardList}>
        {
          filterCards.slice(-20).map((card) => <ErrorBoundary key={card.id}><CardItem key={card.id} card={card} /></ErrorBoundary>)
        }
      </div>
      <EditCardModal />
      <AddCardLinkModal />
      <EditorSourceValue open={sourceViewOpen} onClose={close} content={content} />
    </div>
  )
}

export default Cards;
