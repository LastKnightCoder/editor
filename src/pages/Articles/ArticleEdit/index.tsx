import {useEffect, useRef} from "react";
import { Skeleton, FloatButton } from "antd";
import dayjs from "dayjs";
import { CalendarOutlined, TagsOutlined, EditOutlined, ReadOutlined } from '@ant-design/icons';

import Editor, { EditorRef } from "@/components/Editor";
import useEditArticleStore, {EditingArticle} from "@/hooks/useEditArticleStore.ts";
import { CREATE_ARTICLE_ID } from "@/constants";

import styles from './index.module.less';
import { isArticleChanged } from "./utils.ts";

const ArticleEdit = () => {
  const {
    editingArticleId,
    initArticle,
    initLoading,
    editingArticle,
    readonly,
    createArticle,
    updateArticle,
    onTitleChange,
  } = useEditArticleStore((state) => ({
    editingArticleId: state.editingArticleId,
    initArticle: state.initArticle,
    initLoading: state.initLoading,
    editingArticle: state.editingArticle,
    readonly: state.readonly,
    createArticle: state.createArticle,
    updateArticle: state.updateArticle,
    onTitleChange: state.onTitleChange,
  }));

  const editorRef = useRef<EditorRef>(null);
  const originalArticle = useRef<EditingArticle>();
  const changed = useRef<boolean>(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!editingArticleId) return;
    initArticle(editingArticleId).then(initArticle => {
      originalArticle.current = initArticle;
      editorRef.current?.setEditorValue(initArticle.content);
    });

    return () => {
      if (changed.current) {
        if (editingArticleId === CREATE_ARTICLE_ID) {
          createArticle().then();
        } else {
          updateArticle().then();
        }
      }
    }
  }, [editingArticleId]);

  useEffect(() => {
    if (!originalArticle.current || !editingArticle) return;
    changed.current = isArticleChanged(originalArticle.current, editingArticle);
  }, [editingArticle]);

  const toggleReadonly = () => {
    useEditArticleStore.setState({
      readonly: !readonly,
    })
    onTitleChange(titleRef.current?.textContent || '');
  }

  if (initLoading) return <Skeleton active />
  if (!editingArticle) return <div>文章不存在</div>

  return (
    <div className={styles.editorContainer}>
      <div className={styles.cover}>
        <h1
          ref={titleRef}
          className={styles.title}
          contentEditable={!readonly}
          suppressContentEditableWarning
        >
          {editingArticle.title}
        </h1>
        <div className={styles.metaInfo}>
          <div className={styles.meta}>
            <CalendarOutlined />
            <span className={styles.date}>发表于{dayjs(editingArticle.update_time).format('YYYY-MM-DD')}</span>
          </div>
          <div className={styles.divider}>|</div>
          <div className={styles.meta}>
            <CalendarOutlined />
            <span className={styles.date}>最后更新于{dayjs(editingArticle.update_time).format('YYYY-MM-DD')}</span>
          </div>
        </div>
        <div className={styles.metaInfo}>
          <div className={styles.meta}>
            <TagsOutlined />
            <span className={styles.tags}>{editingArticle.tags.join(' ')}</span>
          </div>
        </div>
      </div>
      <div className={styles.contentContainer}>
        <Editor
          ref={editorRef}
          initValue={editingArticle.content}
          readonly={readonly}
        />
      </div>
      <FloatButton
        icon={readonly ? <EditOutlined /> : <ReadOutlined />}
        onClick={toggleReadonly}
      />
    </div>
  )
}

export default ArticleEdit;