import { MdOutlineArrowBackIosNew } from 'react-icons/md';
import { useParams, useNavigate } from "react-router-dom";

import styles from './index.module.less';
import {useEffect} from "react";
import {Button, Skeleton} from "antd";
import Editor from "@/components/Editor";
import useEditCardStore from "../hooks/useEditCardStore.ts";
import AddTag from "@/pages/Cards/AddTag";
import useCardsManagementStore from "@/pages/Cards/hooks/useCardsManagementStore.ts";
import CardList from "./CardList";
import AddCardLinkModal from "@/pages/Cards/CardDetail/AddCardLinkModal";

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
    openAddLinkModal
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
  }));

  const {
    cards
  } = useCardsManagementStore(state => ({
    cards: state.cards
  }))

  const linkedList = cards.filter(card => editingCard?.links.includes(card.id));

  useEffect(() => {
    if (cardId === '') return;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    init(cardId && Number(cardId))
  }, [cardId, init]);

  const goBack = () => {
    onCancel();
    navigate(-1);
  }

  const saveCard = async () => {
    await onSave();
    navigate(-1);
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
        </div>
      </div>
      <div className={styles.editorContainer}>
        <div className={styles.editorWrapper}>
          <div className={styles.editor}>
            {
              initLoading
                ? <Skeleton active />
                : <Editor initValue={editingCard?.content} readonly={false} onChange={onEdit} />
            }
          </div>
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
                : <CardList list={linkedList} showClose />
            }
          </div>
        </div>
      </div>
      <AddCardLinkModal />
    </div>
  )
}

export default CardDetail;