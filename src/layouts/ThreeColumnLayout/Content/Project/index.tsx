import  { useEffect, useRef } from "react";
import useUploadImage from "@/hooks/useUploadImage.ts";
import { useMemoizedFn, useRafInterval } from "ahooks";
import useEdit from './useEdit';
import useProjectsStore from "@/stores/useProjectsStore";

import { formatDate } from "@/utils/time";

import Editor, { EditorRef } from "@/components/Editor";
import EditText from "@/components/EditText";
import EditorOutline from "../../components/EditorOutline";

import styles from './index.module.less';

const Project = () => {
  const editorRef = useRef<EditorRef>(null);

  const {
    projectItem,
    onInit,
    onTitleChange,
    onContentChange,
    wordsCount,
    saveProjectItem
  } = useEdit();

  const {
    showOutline,
    readonly,
  } = useProjectsStore(state => ({
    showOutline: state.showOutline,
    readonly: state.readonly,
  }));

  useRafInterval(() => {
    if (readonly) return;
    saveProjectItem();
  }, 1000);

  useEffect(() => {
    return () => {
      if (readonly) return;
      saveProjectItem();
    }
  }, [readonly, saveProjectItem]);

  const uploadImage = useUploadImage();

  const onClickHeader = useMemoizedFn((index: number) => {
    editorRef.current?.scrollHeaderIntoView(index);
  });

  const onPressEnter = useMemoizedFn(() => {
    editorRef.current?.focus();
  });

  if (!projectItem) return null;

  return (
    <div className={styles.editProjectContainer}>
      <div className={styles.editProject}>
        <div className={styles.editorContainer}>
          <div className={styles.title}>
            <EditText
              key={projectItem.id}
              defaultValue={projectItem.title}
              onChange={onTitleChange}
              contentEditable={!readonly}
              onPressEnter={onPressEnter}
            />
          </div>
          <div className={styles.time}>
            <div>创建于 {formatDate(projectItem.createTime, true)}</div>
            <div>最后修改于 {formatDate(projectItem.updateTime, true)}</div>
          </div>
          <Editor
            key={projectItem.id}
            ref={editorRef}
            initValue={projectItem.content}
            onInit={onInit}
            onChange={onContentChange}
            uploadImage={uploadImage}
            readonly={readonly}
          />
        </div>
        <EditorOutline
          className={styles.outline}
          content={projectItem.content}
          show={showOutline}
          onClickHeader={onClickHeader}
        />
      </div>
      <div className={styles.statusBar}>
        <div style={{
          lineHeight: '20px',
          fontSize: 14,
          opacity: .8
        }}>
          <div>字数：{wordsCount}</div>
        </div>
      </div>
    </div>
  )
}

export default Project;
