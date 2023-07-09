import useEditCardStore from "../../hooks/useEditCardStore.ts";
import Tags from "@/components/Tags";
import {useState} from "react";
import {Button, Input} from "antd";
import styles from './index.module.less';
import {PlusOutlined} from "@ant-design/icons";
import {isEditorValueEmpty} from "@/utils";

const Footer = () => {
  const {
    editingCard,
    editable,
    addTag,
    removeTag,
    onCancel,
    onOk
  } = useEditCardStore((state) => ({
    editingCard: state.editingCard,
    editable: state.cardEditable,
    addTag: state.addTag,
    removeTag: state.removeTag,
    onCancel: state.onEditingCardCancel,
    onOk: state.onEditingCardSave,
  }));

  const [addTagVisible, setAddTagVisible] = useState(false);
  const [inputTag, setInputTag] = useState('');
  const { tags = [] } = editingCard || {};

  const handleAddTag = () => {
    addTag(inputTag);
    setInputTag('');
    setAddTagVisible(false);
  }

  const disabled = editingCard?.content && isEditorValueEmpty(editingCard?.content);

  const renderTagView = () => {
    if (!editable) return null;
    if (addTagVisible) {
      return (
        <Input
          className={styles.inputTag}
          autoFocus
          value={inputTag}
          onChange={(e) => setInputTag(e.target.value)}
          onPressEnter={handleAddTag}
          onBlur={handleAddTag}
        />
      )
    } else {
      return (
        <div
          className={styles.addTagButton}
          onClick={() => setAddTagVisible(true)}
        >
          <PlusOutlined /> 添加标签
        </div>
      )
    }
  }

  return (
    <div className={styles.footer}>
      { renderTagView() }
      { tags.length > 0 && <Tags className={styles.tags} tags={tags} closable={editable} onClose={removeTag} /> }
      {
        editable &&
        <div className={styles.buttons}>
          <Button size={'small'} onClick={onCancel} style={{ fontSize: 12 }}>取消</Button>
          <Button size={'small'} type={'primary'} disabled={disabled} style={{ fontSize: 12 }} onClick={onOk}>保存</Button>
        </div>
      }
    </div>
  )
}

export default Footer;