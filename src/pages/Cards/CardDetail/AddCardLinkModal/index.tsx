import {Button, Drawer, Empty, Input} from 'antd';
import useEditCardStore from "../../hooks/useEditCardStore.ts";
import CardList from '../CardList';
import useCardsManagementStore from "@/pages/Cards/hooks/useCardsManagementStore.ts";
import styles from './index.module.less';
import {useMemo, useState} from "react";
import Tags from "@/components/Tags";
import {ICard} from "@/types";

const AddCardLinkModal = () => {
  const {
    open,
    editingCard,
    closeAddLinkModal,
    addLink,
  } = useEditCardStore((state) => ({
    open: state.addLinkModalOpen,
    editingCard: state.editingCard,
    closeAddLinkModal: state.closeAddLinkModal,
    addLink: state.addLink
  }));
  
  const [searchValue, setSearchValue] = useState('');
  const [searchTags, setSearchTags] = useState<string[]>([]);
  const [toBeAddedCards, setToBeAddedCards] = useState<number[]>([]);

  const {
    cards
  } = useCardsManagementStore(state => ({
    cards: state.cards
  }));
  
  const notLinkedList = useMemo(() => {
    const filteredCards =
      cards
        .filter(card => editingCard?.id !== card.id)
        .filter(card => !editingCard?.links.includes(card.id))
        .filter(card => !toBeAddedCards.includes(card.id))
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
  }, [cards, editingCard?.id, editingCard?.links, searchTags, toBeAddedCards]);
  const toBeLinkedList = toBeAddedCards.map(id => cards.find(card => card.id === id));

  const onSearch = () => {
    setSearchTags([...searchTags, searchValue]);
    setSearchValue('');
  }

  const onDeleteTag = (tag: string) => {
    setSearchTags(searchTags.filter(searchTag => searchTag !== tag));
  }

  const onAddToLink = (id: number) => {
    setToBeAddedCards([...new Set([...toBeAddedCards, id])])
  }

  const onRemoveLink = (id: number) => {
    setToBeAddedCards(toBeAddedCards.filter(card => card !== id))
  }

  const addAllLinks = async () => {
    toBeAddedCards.forEach(cardId => addLink(cardId));
    setSearchTags([]);
    setSearchValue('');
    setToBeAddedCards([]);
    onCloseModal();
  }

  const onCloseModal = () => {
    setSearchValue('');
    setSearchTags([]);
    closeAddLinkModal();
  }

  if (!open) {
    return null;
  }

  return (
    <Drawer
      title={'链接管理，点击即可添加'}
      open={open}
      onClose={onCloseModal}
      className={styles.drawer}
      width={600}
      footer={(
        <div className={styles.footer}>
          <Button onClick={onCloseModal}>取消</Button>
          <Button type={'primary'} onClick={addAllLinks}>确定</Button>
        </div>
      )}
    >
      <Input
        value={searchValue}
        prefix={searchTags.length > 0 ? <Tags closable tags={searchTags} onClose={onDeleteTag} /> : undefined}
        onChange={(e) => { setSearchValue(e.target.value) }}
        onPressEnter={onSearch}
        placeholder={'请输入标签进行筛选'}
      />
      <div className={styles.linkTitle}>即将链接的卡片</div>
      {
        toBeLinkedList.length > 0
          ? <CardList onClose={onRemoveLink} list={toBeLinkedList as ICard[]} showClose />
          : <Empty />
      }
      <div className={styles.linkTitle}>未链接的卡片</div>
      {
        notLinkedList.length > 0
          ? <CardList onClick={onAddToLink} list={notLinkedList.slice(0, 20)} />
          : <Empty />
      }
    </Drawer>
  )
}

export default AddCardLinkModal;