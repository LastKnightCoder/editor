import {useEffect, useRef} from "react";
import { Skeleton, Button } from "antd";
import {LinkOutlined, CloseOutlined} from '@ant-design/icons';

import useEditCardStore, { EditingCard } from "@/hooks/useEditCardStore.ts";
import Editor, {EditorRef} from "@/components/Editor";

import AddTag from "../AddTag";

import styles from './index.module.less';

const CardDetail = () => {
  const editorRef = useRef<EditorRef>(null);
  const originalCard = useRef<EditingCard>();
  const changed = useRef<boolean>(false);

  const {
    editingCard,
    editingCardId,
    init,
    onEdit,
    initLoading,
    addTag,
    removeTag,
    onEditingCardSave,
    openAddLinkModal,
  } = useEditCardStore((state) => ({
    editingCard: state.editingCard,
    editingCardId: state.editingCardId,
    init: state.initCard,
    onEdit: state.onEditingCardChange,
    initLoading: state.initLoading,
    addTag: state.addTag,
    removeTag: state.removeTag,
    onEditingCardSave: state.onEditingCardSave,
    openAddLinkModal: state.openAddLinkModal,
  }));

  useEffect(() => {
    if (!editingCardId) return;
    init(editingCardId).then((card) => {
      if (editorRef.current === null) return;
      editorRef.current.setEditorValue(card.content);
      originalCard.current = editingCard;
    });
    
    return () => {
      if (changed.current) {
        onEditingCardSave().then();
      }
    }
  }, [editingCardId, init, onEditingCardSave]);

  useEffect(() => {
    const content = editingCard?.content;
    const links = editingCard?.links;
    const tags = editingCard?.tags;
    if (!content) return;
    changed.current = 
      JSON.stringify(content) !== JSON.stringify(originalCard.current?.content) ||
      JSON.stringify(links) !== JSON.stringify(originalCard.current?.links) ||
      JSON.stringify(tags) !== JSON.stringify(originalCard.current?.tags);
  }, [editingCard]);

  const onClose = () => {
    useEditCardStore.setState({
      editingCardId: undefined,
    })
  }

  if (!editingCard || !editingCardId) {
    return null;
  }

  return (
    <div className={styles.cardDetail}>
      <div className={styles.header}>
        <Button icon={<LinkOutlined />} onClick={openAddLinkModal}>添加连接</Button>
        <Button icon={<CloseOutlined />} onClick={onClose}>结束编辑</Button>
      </div>
      <div className={styles.editorContainer}>
        <div className={styles.editor}>
          {
            initLoading
              ? <Skeleton active />
              : <Editor
                  ref={editorRef}
                  initValue={editingCard?.content && editingCard.content.length > 0 ? editingCard.content : undefined}
                  readonly={false}
                  onChange={onEdit}
                />
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
    </div>
  )
}

export default CardDetail;