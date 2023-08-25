import {useEffect, useRef} from "react";
import { Skeleton, FloatButton } from "antd";
import dayjs from "dayjs";
import { CalendarOutlined, TagsOutlined, EditOutlined, ReadOutlined, UpOutlined } from '@ant-design/icons';

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
    onContentChange,
  } = useEditArticleStore((state) => ({
    editingArticleId: state.editingArticleId,
    initArticle: state.initArticle,
    initLoading: state.initLoading,
    editingArticle: state.editingArticle,
    readonly: state.readonly,
    createArticle: state.createArticle,
    updateArticle: state.updateArticle,
    onTitleChange: state.onTitleChange,
    onContentChange: state.onContentChange,
  }));

  const editorRef = useRef<EditorRef>(null);
  const originalArticle = useRef<EditingArticle>();
  const changed = useRef<boolean>(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const scrollToTop = () => {
    containerRef.current?.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  if (initLoading) return <Skeleton active />
  if (!editingArticle) return <div>文章不存在</div>

  return (
    <div ref={containerRef} className={styles.editorContainer}>
      <div className={styles.cover}>
        <h1
          ref={titleRef}
          className={styles.title}
          contentEditable={!readonly}
          suppressContentEditableWarning
        >
          {editingArticle.title || '无标题'}
        </h1>
        <div className={styles.metaInfo}>
          <div className={styles.meta}>
            <CalendarOutlined />
            <span className={styles.date}>
              创建于{dayjs(editingArticle.create_time).format('YYYY-MM-DD HH:mm:ss')}
            </span>
          </div>
          <div className={styles.divider}>|</div>
          <div className={styles.meta}>
            <CalendarOutlined />
            <span className={styles.date}>
              更新于{dayjs(editingArticle.update_time).format('YYYY-MM-DD HH:mm:ss')}
            </span>
          </div>
        </div>
        <div className={styles.metaInfo}>
          <div className={styles.meta}>
            <TagsOutlined />
            <span className={styles.tags}>{editingArticle.tags.join(' ') || '无标签'}</span>
          </div>
        </div>
      </div>
      <div className={styles.contentContainer}>
        <Editor
          ref={editorRef}
          onChange={onContentChange}
          initValue={editingArticle.content}
          readonly={readonly}
        />
      </div>
      <FloatButton.Group shape={'square'}>
        <FloatButton
          icon={readonly ? <EditOutlined /> : <ReadOutlined />}
          onClick={toggleReadonly}
          tooltip={readonly ? '编辑' : '只读'}
        />
        <FloatButton
          icon={<UpOutlined />}
          onClick={scrollToTop}
          tooltip={'回到顶部'}
        />
      </FloatButton.Group>
    </div>
  )
}

export default ArticleEdit;