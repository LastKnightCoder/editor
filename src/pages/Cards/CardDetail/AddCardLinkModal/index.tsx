import {useEffect, useMemo, useState} from "react";
import { Empty, Input, Modal } from 'antd';

import useEditCardStore from "@/stores/useEditCardStore.ts";
import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";

import Tags from "@/components/Tags";
import {ICard} from "@/types";


import styles from './index.module.less';
import CardItem from "../../CardItem";

const AddCardLinkModal = () => {
  const {
    open,
    editingCard,
    addLink,
  } = useEditCardStore((state) => ({
    open: state.addLinkModalOpen,
    editingCard: state.editingCard,
    addLink: state.addLink,
  }));

  const {
    cards
  } = useCardsManagementStore(state => ({
    cards: state.cards
  }));

  const [searchValue, setSearchValue] = useState('');
  const [searchTags, setSearchTags] = useState<string[]>([]);
  const [selectedCards, setSelectedCards] = useState<ICard[]>(() => {
    return editingCard?.links.map(id => cards.find(card => card.id === id)) as ICard[];
  });
  
  useEffect(() => {
    setSearchValue('');
    setSearchTags([]);
    setSelectedCards(editingCard?.links.map(id => cards.find(card => card.id === id)) as ICard[]);
  }, [cards, editingCard]);
  
  const notLinkedList = useMemo(() => {
    const filteredCards =
      cards
        .filter(card => editingCard?.id !== card.id)
        .filter(card => !editingCard?.links.includes(card.id))
        .filter(card => !selectedCards.includes(card));
    if (searchTags.length === 0) return filteredCards;
    return (
      filteredCards
        .filter(
          card =>
            searchTags.every(
              searchTag =>
                card.tags.some(
                  tag =>
                    tag.toLowerCase().includes(searchTag.toLowerCase())
                )
            )
        )
    )
  }, [cards, editingCard?.id, editingCard?.links, searchTags, selectedCards]);
  
  const onSearch = () => {
    setSearchTags([...searchTags, searchValue]);
    setSearchValue('');
  }

  const onDeleteTag = (tag: string) => {
    setSearchTags(searchTags.filter(searchTag => searchTag !== tag));
  }

  const onCloseModal = () => {
    setSearchValue('');
    setSearchTags([]);
    useEditCardStore.setState({
      addLinkModalOpen: false,
    });
  }

  const onAddCard = (card: ICard) => {
    setSelectedCards([card, ...selectedCards]);
  }

  const onRemoveCard = (card: ICard) => {
    setSelectedCards(selectedCards.filter(selectedCard => selectedCard.id !== card.id));
  }
  
  const onOk = () => {
    selectedCards.forEach(card => {
      addLink(card.id);
    })
    onCloseModal();
  }

  if (!open) {
    return null;
  }
  
  return (
    <Modal
      title={'添加相关卡片'}
      open={open}
      onOk={onOk}
      onCancel={onCloseModal}
      width={800}
      bodyStyle={{
        height: 500,
        boxSizing: 'border-box'
      }}
    >
      <div className={styles.modal}>
        <div className={styles.sidebar}>
          {
            <>
              <Input
                value={searchValue}
                prefix={searchTags.length > 0 ? <Tags closable tags={searchTags} onClose={onDeleteTag} /> : undefined}
                onChange={(e) => { setSearchValue(e.target.value) }}
                onPressEnter={onSearch}
                placeholder={'请输入标签进行筛选'}
              />
              {
                notLinkedList.length > 0
                  ? notLinkedList.slice(0, 20).map(card => (<CardItem onClick={() => { onAddCard(card) }} key={card.id} card={card} showDelete={false} />))
                  : <Empty />
              }
            </>
          }
        </div>
        <div className={styles.selectPanel}>
          <div style={{ fontWeight: 700 }}>已选卡片：</div>
          {
            selectedCards.map(card => (
              <CardItem key={card.id} card={card} onDelete={() => { onRemoveCard(card) }} />
            ))
          }
        </div>
      </div>
    </Modal>
  )
}

export default AddCardLinkModal;