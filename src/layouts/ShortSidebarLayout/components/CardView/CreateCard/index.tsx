import styles from './index.module.less';
import Editor, { EditorRef } from "@editor/index.tsx";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { Descendant } from "slate";
import AddTag from "@/components/AddTag";
import { memo, useEffect, useRef } from 'react';
import classnames from "classnames";
import { Button } from "antd";

const DEFAULT_CONTENT = [{
  type: 'paragraph',
  children: [{
    type: 'formatted',
    text: ''
  }],
}] as Descendant[];

interface CreateCardProps {
  className?: string;
  onSave: (content: Descendant[], tags: string[]) => Promise<void>;
  onCancel: () => void;
}

const CreateCard = memo((props: CreateCardProps) => {
  const { className, onSave, onCancel } = props;
  const editorRef = useRef<EditorRef>(null);
  const [content, setContent] = useLocalStorageState<Descendant[]>('card-edit-content', {
    defaultValue: DEFAULT_CONTENT
  });
  const [tags, setTags] = useLocalStorageState<string[]>('card-edit-tags', {
    defaultValue: []
  });
  
  useEffect(() => {
    editorRef.current?.focus();
  }, []);
  
  const onAddTag = (tag: string) => {
    setTags([...new Set([...tags || [], tag])]);
  }
  
  const onRemoveTag = (tag: string) => {
    setTags((tags || []).filter(t => t !== tag));
  }
  
  const onSaveCard = useMemoizedFn(async (content: Descendant[], tags: string[]) => {
    await onSave(content, tags);
    setContent(DEFAULT_CONTENT);
    setTags([]);
    editorRef.current?.setEditorValue(DEFAULT_CONTENT);
  });
  
  const onCancelSaveCard = () => {
    setContent(DEFAULT_CONTENT);
    setTags([]);
    editorRef.current?.setEditorValue(DEFAULT_CONTENT);
    onCancel();
  }
  
  return (
    <div className={classnames(styles.container, className)}>
      <Editor
        ref={editorRef}
        initValue={content || DEFAULT_CONTENT}
        readonly={false}
        onChange={setContent}
      />
      <div className={styles.save}>
        <AddTag tags={tags || []} addTag={onAddTag} removeTag={onRemoveTag} />
        <div className={styles.buttons}>
          <Button onClick={onCancelSaveCard}>取消</Button>
          <Button onClick={onSaveCard.bind(null, content || DEFAULT_CONTENT, tags || [])}>保存</Button>
        </div>
      </div>
    </div>
  )
});

export default CreateCard;
