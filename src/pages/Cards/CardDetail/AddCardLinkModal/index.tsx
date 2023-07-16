import {Drawer, Input} from 'antd';
import useEditCardStore from "../../hooks/useEditCardStore.ts";
import CardList from '../CardList';
import useCardsManagementStore from "@/pages/Cards/hooks/useCardsManagementStore.ts";
import styles from './index.module.less';
import {useMemo, useState} from "react";
import Tags from "@/components/Tags";

const AddCardLinkModal = () => {
  const {
    open,
    editingCard,
    closeAddLinkModal,
  } = useEditCardStore((state) => ({
    open: state.addLinkModalOpen,
    editingCard: state.editingCard,
    closeAddLinkModal: state.closeAddLinkModal
  }));
  
  const [searchValue, setSearchValue] = useState('');
  const [searchTags, setSearchTags] = useState<string[]>([]);

  const {
    cards
  } = useCardsManagementStore(state => ({
    cards: state.cards
  }));
  
  const notLinkedList = useMemo(() => {
    if (searchTags.length === 0) return cards;
    return (
      cards
        .filter(card => !editingCard?.links.includes(card.id))
        .filter(
          card =>
            searchTags.some(
              searchTag =>
                card.tags.some(
                  tag =>
                    tag.toLowerCase().includes(searchTag.toLowerCase())
                )
            )
        )
    )
  }, [cards, editingCard?.links, searchTags]);

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
    closeAddLinkModal();
  }

  if (!open) {
    return null;
  }

  return (
    <Drawer
      title={'链接管理'}
      open={open}
      onClose={onCloseModal}
      className={styles.modal}
      width={600}
    >
      <Input
        value={searchValue}
        prefix={searchTags.length > 0 ? <Tags closable tags={searchTags} onClose={onDeleteTag} /> : undefined}
        onChange={(e) => { setSearchValue(e.target.value) }}
        onPressEnter={onSearch}
        placeholder={'请输入标签进行筛选'}
      />
      {
        notLinkedList.length > 0 &&
        <CardList list={notLinkedList.slice(0, 10)} />
      }
    </Drawer>
  )
}

export default AddCardLinkModal;