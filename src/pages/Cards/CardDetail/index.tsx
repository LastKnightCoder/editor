import {useEffect, useRef} from "react";
import { Skeleton } from "antd";

import useEditCardStore from "@/hooks/useEditCardStore.ts";
import Editor, {EditorRef} from "@/components/Editor";

import AddTag from "../AddTag";
import AddCardLinkModal from "./AddCardLinkModal";

import styles from './index.module.less';
import {Descendant} from "slate";

const CardDetail = ({ cardId }: { cardId: number }) => {
  const editorRef = useRef<EditorRef>(null);
  const originalContent = useRef<Descendant[]>([]);
  const changed = useRef<boolean>(false);

  const {
    editingCard,
    init,
    onEdit,
    initLoading,
    addTag,
    removeTag,
    onEditingCardSave,
  } = useEditCardStore((state) => ({
    editingCard: state.editingCard,
    init: state.initCard,
    onEdit: state.onEditingCardChange,
    initLoading: state.initLoading,
    addTag: state.addTag,
    removeTag: state.removeTag,
    onEditingCardSave: state.onEditingCardSave,
  }));

  useEffect(() => {
    init(cardId).then((initValue) => {
      if (editorRef.current === null) return;
      editorRef.current.setEditorValue(initValue);
      originalContent.current = initValue;
    });
    
    return () => {
      if (changed.current) {
        onEditingCardSave().then();
      }
    }
  }, [cardId, init, onEditingCardSave]);

  useEffect(() => {
    const content = editingCard?.content;
    if (!content) return;
    changed.current = JSON.stringify(content) !== JSON.stringify(originalContent.current);
  }, [editingCard]);

  return (
    <div className={styles.cardDetail}>
      <div className={styles.editorContainer}>
        <div className={styles.editor}>
          {
            initLoading
              ? <Skeleton active />
              : <Editor ref={editorRef} initValue={editingCard?.content && editingCard.content.length > 0 ? editingCard.content : undefined} readonly={false} onChange={onEdit} />
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