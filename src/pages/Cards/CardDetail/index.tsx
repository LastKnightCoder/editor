import {useEffect} from "react";
import {Button, Modal, Skeleton, Switch} from "antd";
import { MdOutlineArrowBackIosNew } from 'react-icons/md';
import { useParams, useNavigate } from "react-router-dom";

import Editor from "@/components/Editor";
import AddTag from "@/pages/Cards/AddTag";
import useCardsManagementStore from "@/pages/Cards/hooks/useCardsManagementStore.ts";
import AddCardLinkModal from "@/pages/Cards/CardDetail/AddCardLinkModal";

import CardList from "./CardList";
import styles from './index.module.less';
import useEditCardStore from "../hooks/useEditCardStore.ts";

const CardDetail = () => {
  const { cardId } = useParams();
  const navigate = useNavigate();
  
  const {
    editingCard,
    init,
    onEdit,
    onCancel,
    onSave,
    initLoading,
    addTag,
    removeTag,
    openAddLinkModal,
    removeLink,
    readonly,
    setReadonly
  } = useEditCardStore((state) => ({
    editingCard: state.editingCard,
    init: state.initCard,
    onEdit: state.onEditingCardChange,
    onCancel: state.onEditingCardCancel,
    onSave: state.onEditingCardSave,
    initLoading: state.initLoading,
    addTag: state.addTag,
    removeTag: state.removeTag,
    openAddLinkModal: state.openAddLinkModal,
    removeLink: state.removeLink,
    readonly: state.readonly,
    setReadonly: state.setReadonly,
  }));

  const {
    cards
  } = useCardsManagementStore(state => ({
    cards: state.cards
  }))

  const linkedList = cards.filter(card => editingCard?.links.includes(card.id));

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    init(cardId && Number(cardId))
  }, [cardId, init]);

  const goBack = () => {
    navigate(-1);
    onCancel();
  }

  const saveCard = async () => {
    await onSave();
    navigate(-1);
  }

  const onClickLinkCard = (cardId: number) => {
    Modal.confirm({
      title: '前往编辑被链接的卡片',
      content: '当前编辑的卡片将会被保存',
      onOk: async () => {
        await onSave();
        navigate(`/cards/detail/${cardId}`)
      },
      okText: '确认',
      cancelText: '取消'
    });
  }

  const unLinkCard = (cardId: number) => {
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

  return (
    <div className={styles.cardDetail}>
      <div className={styles.header}>
        <div className={styles.back} onClick={goBack}>
          <MdOutlineArrowBackIosNew />
        </div>
        <div className={styles.actions}>
          <Button onClick={openAddLinkModal}>添加链接</Button>
          <Button type="primary" onClick={saveCard}>保存</Button>
          <div>
            只读：<Switch checked={readonly} onChange={setReadonly} />
          </div>
        </div>
      </div>
      <div className={styles.editorContainer}>
        <div className={styles.editor}>
          {
            initLoading
              ? <Skeleton active />
              : <Editor initValue={editingCard?.content} readonly={readonly} onChange={onEdit} />
          }
        </div>
        <div className={styles.sidebar}>
          <div className={styles.title}>已添加标签：</div>
          <div>
            {
              initLoading
                ? <Skeleton active />
                : <AddTag tags={editingCard?.tags || []} addTag={addTag} removeTag={removeTag} />
            }
          </div>
          <div className={styles.title}>已链接列表：</div>
          <div className={styles.linkedList}>
            {
              initLoading
                ? <Skeleton active />
                : <CardList onClick={onClickLinkCard} onClose={unLinkCard} list={linkedList} showClose />
            }
          </div>
        </div>
      </div>
      <AddCardLinkModal />
    </div>
  )
}

export default CardDetail;