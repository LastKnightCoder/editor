import {Input, Modal} from 'antd';
import useEditCardStore from "../hooks/useEditCardStore.ts";
import CardList from './CardList';
import useCardsManagementStore from "@/pages/Cards/hooks/useCardsManagementStore.ts";
import styles from './index.module.less';

const AddCardLinkModal = () => {
  const {
    open,
    onOk,
    onCancel,
    searchValue,
    setSearchValue,
    notLinkedList,
    editingCard
  } = useEditCardStore((state) => ({
    open: state.addLinkModalOpen,
    onOk: state.onEditingCardSave,
    onCancel: state.onEditingCardCancel,
    searchValue: state.linkSearchValue,
    setSearchValue: state.setLinkSearchValue,
    notLinkedList: state.toBeLinkedCardList,
    editingCard: state.editingCard
  }));

  const {
    cards
  } = useCardsManagementStore(state => ({
    cards: state.cards
  }))

  const linkedList = cards.filter(card => editingCard?.links.includes(card.id));

  if (!open) {
    return null;
  }

  return (
    <Modal
      title={'链接管理'}
      open={open}
      maskClosable={false}
      onOk={onOk}
      onCancel={onCancel}
      className={styles.modal}
      width={800}
      bodyStyle={{
        overflow: 'auto',
        minHeight: 400,
        maxHeight: 'calc(100vh - 300px)',
        padding: '10px 0'
      }}
      okText={'确定'}
      cancelText={'取消'}
    >
      <Input
        value={searchValue}
        onChange={(e) => { setSearchValue(e.target.value) }}
        placeholder={'请输入标签进行筛选'}
        allowClear
      />
      {
        linkedList.length > 0 &&
        <>
          <div className={styles.linkTitle}>
            已链接卡片
          </div>
          <CardList list={linkedList} showClose={true} />
        </>
      }
      {
        notLinkedList.length > 0 &&
        <>
          <div className={styles.linkTitle}>
            未链接卡片
          </div>
          <CardList list={notLinkedList.slice(0, 10)} />
        </>
      }
    </Modal>
  )
}

export default AddCardLinkModal;