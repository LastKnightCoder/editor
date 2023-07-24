import { useEffect } from "react";
import { Skeleton } from "antd";
import { useParams } from "react-router-dom";

import useEditCardStore from "@/hooks/useEditCardStore.ts";
import Editor from "@/components/Editor";

import AddTag from "../AddTag";
import AddCardLinkModal from "./AddCardLinkModal";
import Header from "./Header";

import styles from './index.module.less';

const CardDetail = () => {
  const { cardId } = useParams();

  const {
    editingCard,
    init,
    onEdit,
    initLoading,
    addTag,
    removeTag,
    readonly,
  } = useEditCardStore((state) => ({
    editingCard: state.editingCard,
    init: state.initCard,
    onEdit: state.onEditingCardChange,
    initLoading: state.initLoading,
    addTag: state.addTag,
    removeTag: state.removeTag,
    readonly: state.readonly,
  }));

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    init(cardId && Number(cardId))
  }, [cardId, init]);

  return (
    <div className={styles.cardDetail}>
      <Header />
      <div className={styles.editorContainer}>
        <div className={styles.editor}>
          {
            initLoading
              ? <Skeleton active />
              : <Editor initValue={editingCard?.content && editingCard.content.length > 0 ? editingCard.content : undefined} readonly={readonly} onChange={onEdit} />
          }
        </div>
        <div className={styles.tags}>
          {
            initLoading
              ? <Skeleton active />
              : <AddTag tags={editingCard?.tags || []} addTag={addTag} removeTag={removeTag} />
          }
        </div>
      </div>
      <AddCardLinkModal />
    </div>
  )
}

export default CardDetail;