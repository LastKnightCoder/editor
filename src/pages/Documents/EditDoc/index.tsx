import { useRef, useState, useEffect } from "react";
import { Tooltip } from "antd";
import { useRafInterval } from "ahooks";
import Editor, { EditorRef } from "@/components/Editor";
import { EditOutlined, ReadOutlined } from "@ant-design/icons";

import { formatDate } from "@/utils/time.ts";

import useEditDoc from "./useEditDoc";
import styles from './index.module.less';

const EditDoc = () => {
  const [editingTitle, setEditingTitle] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<EditorRef>(null);
  const [readonly, setReadonly] = useState(false);
  const {
    activeDocumentItem,
    saveDocument,
    onContentChange,
    onTitleChange,
  } = useEditDoc();

  useRafInterval(() => {
    saveDocument();
  }, 3000);

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
      <div className={styles.editDoc}>
        <div className={styles.editorContainer}>
          <div
            className={styles.title}
            ref={titleRef}
            contentEditable={!readonly}
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
          <div className={styles.time}>
            <div>创建于 {formatDate(activeDocumentItem.createTime, true)}</div>
            <div>最后修改于 {formatDate(activeDocumentItem.updateTime, true)}</div>
          </div>
          <Editor
            key={activeDocumentItem.id}
            ref={editorRef}
            initValue={activeDocumentItem.content}
            onChange={onContentChange}
            readonly={readonly}
          />
        </div>
      </div>
      <div className={styles.statusBar}>
        <div>
          {
            readonly ? (
              <Tooltip title={'编辑'}>
                <EditOutlined onClick={() => setReadonly(false)} />
              </Tooltip>
            ) : (
              <Tooltip title={'预览'}>
                <ReadOutlined onClick={() => setReadonly(true)} />
              </Tooltip>
            )
          }
        </div>
      </div>
    </div>
  )
}

export default EditDoc;