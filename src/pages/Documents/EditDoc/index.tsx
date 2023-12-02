import { useRef, useState } from "react";
import Editor, { EditorRef } from "@/components/Editor";

import useEditDoc from "./useEditDoc";
import styles from './index.module.less';
import { useEffect } from "react";

const EditDoc = () => {
  const [editingTitle, setEditingTitle] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<EditorRef>(null);
  const {
    activeDocumentItem,
    saveDocument,
    onContentChange,
    onTitleChange,
  } = useEditDoc();

  useEffect(() => {
    return () => {
      saveDocument();
    }
  }, [saveDocument]);

  useEffect(() => {
    // 禁止在标题中输入回车
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && editingTitle) {
        e.preventDefault();
        e.stopPropagation();
        titleRef.current?.blur();
        editorRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    }
  }, [editingTitle]);

  if (!activeDocumentItem) {
    return null;
  }

  return (
    <div className={styles.editDocContainer}>
      <div className={styles.editorContainer}>
        <div
          className={styles.title}
          ref={titleRef}
          contentEditable
          suppressContentEditableWarning
          onFocus={() => setEditingTitle(true)}
          onBlur={(e) => {
            onTitleChange(e.target.innerText);
            setEditingTitle(false);
          }}
          placeholder={'请输入标题'}
        >
          {activeDocumentItem.title}
        </div>
        <div>
          <div>创建于 {activeDocumentItem.createTime}</div>
        </div>
        <Editor
          key={activeDocumentItem.id}
          ref={editorRef}
          initValue={activeDocumentItem.content}
          onChange={onContentChange}
          readonly={false}
        />
      </div>
    </div>
  )
}

export default EditDoc;