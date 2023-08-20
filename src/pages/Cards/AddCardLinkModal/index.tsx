import {useMemo, useState} from "react";
import {Drawer, Empty, Input, Modal, Tabs, TabsProps} from 'antd';

import useEditCardStore from "@/hooks/useEditCardStore.ts";
import useCardsManagementStore from "@/hooks/useCardsManagementStore.ts";

import Tags from "@/components/Tags";
import {ICard} from "@/types";

import CardList from '../CardDetail/CardList';

import styles from './index.module.less';

const AddCardLinkModal = () => {
  const {
    open,
    editingCard,
    closeAddLinkModal,
    addLink,
    removeLink,
  } = useEditCardStore((state) => ({
    open: state.addLinkModalOpen,
    editingCard: state.editingCard,
    closeAddLinkModal: state.closeAddLinkModal,
    addLink: state.addLink,
    removeLink: state.removeLink,
  }));

  const [searchValue, setSearchValue] = useState('');
  const [searchTags, setSearchTags] = useState<string[]>([]);

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
  }, [cards, editingCard?.id, editingCard?.links, searchTags]);

  const linkedList = editingCard?.links.map(id => cards.find(card => card.id === id)) as ICard[];

  const onSearch = () => {
    setSearchTags([...searchTags, searchValue]);
    setSearchValue('');
  }

  const onDeleteTag = (tag: string) => {
    setSearchTags(searchTags.filter(searchTag => searchTag !== tag));
  }

  const onAddLink = (cardId: number) => {
    Modal.confirm({
      title: '确认添加链接吗？',
      onOk: () => {
        addLink(cardId);
      },
      okText: '确认',
      cancelText: '取消'
    });
  }

  const onRemoveLink = (cardId: number) => {
    Modal.confirm({
      title: '确认删除链接',
      content: '删除链接后，该卡片将不再出现在链接列表中',
      onOk: async () => {
        await removeLink(cardId);
      },
      okText: '确认',
      cancelText: '取消',
      okButtonProps: {
        danger: true
      }
    })
  }

  const onClickLinkCard = (cardId: number) => {
    Modal.confirm({
      title: '前往编辑被链接的卡片',
      content: '当前编辑的卡片将会被保存',
      onOk: async () => {
        useEditCardStore.setState({
          editingCardId: cardId,
        });
        closeAddLinkModal();
      },
      okText: '确认',
      cancelText: '取消'
    });
  }

  const onCloseModal = () => {
    setSearchValue('');
    setSearchTags([]);
    closeAddLinkModal();
  }

  const items: TabsProps['items'] = [{
    key: 'linked-card',
    label: '已链接的卡片',
    children: (
      <>
        {
          linkedList?.length > 0
            ? <CardList onClick={onClickLinkCard} onClose={onRemoveLink} list={linkedList} showClose />
            : <Empty />
        }
      </>
    )
  }, {
    key: 'not-linked-card',
    label: '未链接的卡片',
    children: (
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
            ? <CardList onClick={onAddLink} list={notLinkedList.slice(0, 10)} />
            : <Empty />
        }
      </>
    )
  }]

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
    >
      <Tabs items={items} />
    </Drawer>
  )
}

export default AddCardLinkModal;