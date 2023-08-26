import {useState} from "react";
import {Input} from "antd";
import {PlusOutlined} from "@ant-design/icons";
import Tags from "@/components/Tags";
import styles from './index.module.less';

interface AddTagProps {
  tags: string[];
  addTag: (tag: string) => void;
  removeTag: (tag: string) => void;
  readonly?: boolean;
}

const AddTag = (props: AddTagProps) => {
  const { tags, addTag, removeTag, readonly = false } = props;
  const [addTagVisible, setAddTagVisible] = useState(false);
  const [inputTag, setInputTag] = useState('');

  const handleAddTag = () => {
    addTag(inputTag);
    setInputTag('');
    setAddTagVisible(false);
  }

  const renderTagView = () => {
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
    <>
      {
        tags.length > 0 &&
        <div className={styles.tags}>
          <Tags
            tags={tags}
            closable={!readonly}
            onClose={!readonly ? removeTag : undefined}
            noWrap
            showIcon
          />
        </div>
      }
      { !readonly && renderTagView()}
    </>
  )
}

export default AddTag;