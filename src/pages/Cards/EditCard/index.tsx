import {useEffect, useRef} from 'react';
import { Modal } from 'antd'
import Editor, {EditorRef} from "@/pages/Editor";
import useEditCardStore from "../hooks/useEditCardStore.ts";
import styles from './index.module.less';
import Footer from './Footer';

const EditCard = () => {
  const ref = useRef<EditorRef>(null);

  const {
    open,
    editingCard,
    editable,
    onCardChange,
    onCardSave,
    onCardCancel,
  } = useEditCardStore((state) => ({
    open: state.openEditCardModal,
    editingCard: state.editingCard,
    editable: state.cardEditable,
    onCardChange: state.onEditingCardChange,
    onCardSave: state.onEditingCardSave,
    onCardCancel: state.onEditingCardCancel,
  }));

  // 打开编辑器时，更新编辑器内容，因为编辑器是非受控的
  useEffect(() => {
    if (ref.current && open && editingCard?.content) {
      ref.current.setEditorValue(editingCard.content);
    }
  }, [open])

  return (
    <Modal
      open={open}
      width={600}
      bodyStyle={{
        minHeight: editable ? 200 : undefined,
        maxHeight: 'calc(100vh - 250px)',
        overflow: 'auto',
        padding: '10px 0 0',
        fontFamily: 'var(--font)'
      }}
      // centered
      title={editingCard?.id ? editable ? '编辑卡片' : '卡片详情' : '新建卡片'}
      onOk={onCardSave}
      onCancel={onCardCancel}
      okText={editingCard?.id ? '更新' : '新建'}
      cancelText={'取消'}
      className={styles.modal}
      keyboard={false}
      footer={<Footer />}
      okButtonProps={{
        tabIndex: -1,
      }}
      cancelButtonProps={{
        tabIndex: -1,
      }}
      closable={false}
      maskClosable={!editable}
      mask={!editable}

    >
      <div>
        <Editor
          ref={ref}
          initValue={editingCard?.content || undefined}
          readonly={!editable}
          onChange={onCardChange}
        />
      </div>
    </Modal>
  )
}

export default EditCard;