import {forwardRef, useEffect, useImperativeHandle, useRef} from "react";
import { Skeleton, FloatButton, message, App } from "antd";
import { IoExitOutline } from "react-icons/io5";
import {LinkOutlined, EditOutlined, ReadOutlined, SaveOutlined, UpOutlined} from '@ant-design/icons';

import useEditCardStore, { EditingCard } from "@/hooks/useEditCardStore.ts";
import Editor, {EditorRef} from "@/components/Editor";
import AddTag from "@/components/AddTag";

import styles from './index.module.less';

export interface CardDetailRef {
  quit: () => Promise<void>;
}

const CardDetail = forwardRef<CardDetailRef>((_, ref) => {
  const editorRef = useRef<EditorRef>(null);
  const originalCard = useRef<EditingCard>();
  const changed = useRef<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    editingCard,
    editingCardId,
    init,
    onEdit,
    initLoading,
    addTag,
    removeTag,
    onEditingCardSave,
    readonly,
    toggleReadonly,
  } = useEditCardStore((state) => ({
    editingCard: state.editingCard,
    editingCardId: state.editingCardId,
    init: state.initCard,
    onEdit: state.onEditingCardChange,
    initLoading: state.initLoading,
    addTag: state.addTag,
    removeTag: state.removeTag,
    onEditingCardSave: state.onEditingCardSave,
    readonly: state.readonly,
    toggleReadonly: state.toggleReadonly,
  }));

  const { modal } = App.useApp();

  useEffect(() => {
    if (!editingCardId) return;
    init(editingCardId).then((card) => {
      if (editorRef.current === null) return;
      editorRef.current.setEditorValue(card.content);
      originalCard.current = card;
    });
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

  useImperativeHandle(ref, () => ({
    quit,
  }));

  const quit = async () => {
    return new Promise<void>(resolve => {
      if (changed.current) {
        modal.confirm({
          title: '卡片已修改，是否保存？',
          onOk: async () => {
            await onEditingCardSave();
            useEditCardStore.setState({
              editingCardId: undefined,
            });
            resolve();
          },
          onCancel: () => {
            useEditCardStore.setState({
              editingCardId: undefined,
            });
            resolve();
          }
        })
      } else {
        useEditCardStore.setState({
          editingCardId: undefined,
        });
        resolve();
      }
    })
  }

  const scrollToTop = () => {
    containerRef.current?.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  const openAddLinkModal = () => {
    if (readonly) {
      message.warning('只读模式下无法添加连接').then();
      return;
    }
    useEditCardStore.setState({
      addLinkModalOpen: true,
    });
  }

  const saveCard = async () => {
    await onEditingCardSave();
    changed.current = false;
  }

  if (!editingCard || !editingCardId) {
    return null;
  }

  return (
    <div className={styles.cardDetail}>
      <div ref={containerRef} className={styles.editorContainer}>
        <div className={styles.editor}>
          {
            initLoading
              ? <Skeleton active />
              : <Editor
                  ref={editorRef}
                  initValue={editingCard?.content && editingCard.content.length > 0 ? editingCard.content : undefined}
                  readonly={readonly}
                  onChange={onEdit}
                />
          }
        </div>
        <div className={styles.tags}>
          <AddTag
            tags={editingCard?.tags || []}
            addTag={addTag}
            removeTag={removeTag}
            readonly={readonly}
          />
        </div>
        <FloatButton.Group>
          <FloatButton.Group shape={'square'}>
            <FloatButton
              icon={<SaveOutlined />}
              onClick={saveCard}
              tooltip={'保存'}
            />
            <FloatButton
              icon={readonly ? <EditOutlined /> : <ReadOutlined />}
              onClick={toggleReadonly}
              tooltip={readonly ? '编辑' : '只读'}
            />
            <FloatButton
              icon={<LinkOutlined />}
              onClick={openAddLinkModal}
              tooltip={'添加连接'}
            />
            <FloatButton
              icon={<UpOutlined />}
              onClick={scrollToTop}
              tooltip={'回到顶部'}
            />
            <FloatButton
              icon={<IoExitOutline />}
              onClick={quit}
              tooltip={'结束编辑'}
            />
          </FloatButton.Group>
        </FloatButton.Group>
      </div>
    </div>
  )
});

export default CardDetail;