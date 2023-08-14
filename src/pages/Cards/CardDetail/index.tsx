import { useEffect } from "react";
import { Skeleton } from "antd";

import useEditCardStore from "@/hooks/useEditCardStore.ts";
import Editor from "@/components/Editor";

import AddTag from "../AddTag";
import AddCardLinkModal from "./AddCardLinkModal";
// import Header from "./Header";

import styles from './index.module.less';

const CardDetail = ({ cardId }: { cardId: number }) => {

  const {
    editingCard,
    init,
    onEdit,
    initLoading,
    addTag,
    removeTag,
    // readonly,
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
    init(cardId);
  }, [cardId, init]);

  return (
    <div className={styles.cardDetail}>
      <div className={styles.editorContainer}>
        <div className={styles.editor}>
          {
            initLoading
              ? <Skeleton active />
              : <Editor initValue={editingCard?.content && editingCard.content.length > 0 ? editingCard.content : undefined} readonly={true} onChange={onEdit} />
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