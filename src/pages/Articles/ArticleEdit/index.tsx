import {useEffect, useMemo, useRef} from "react";
import { FloatButton, Spin, Empty, App } from "antd";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";

import { CalendarOutlined, EditOutlined, ReadOutlined, UpOutlined, SaveOutlined } from '@ant-design/icons';
import { IoExitOutline } from 'react-icons/io5';

import Editor, { EditorRef } from "@/components/Editor";
import useEditArticleStore, {EditingArticle} from "@/stores/useEditArticleStore.ts";
import { CREATE_ARTICLE_ID } from "@/constants";

import styles from './index.module.less';
import { isArticleChanged } from "./utils.ts";
import AddTag from "@/components/AddTag";
import For from "@/components/For";
import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";
import ArticleCard from "@/pages/Articles/ArticleCard";
import {IArticle} from "@/types";

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
    onAddTag,
    onRemoveTag,
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
    onAddTag: state.onAddTag,
    onRemoveTag: state.onRemoveTag,
  }));
  
  const {
    articles,
  } = useArticleManagementStore(state => ({
    articles: state.articles,
  }));

  const editorRef = useRef<EditorRef>(null);
  const originalArticle = useRef<EditingArticle>();
  const changed = useRef<boolean>(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const navigate = useNavigate();
  const { modal } = App.useApp();

  const saveArticle = () => {
    if (editingArticleId === CREATE_ARTICLE_ID) {
      createArticle().then();
    } else {
      updateArticle().then();
    }
    changed.current = false;
  }

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

  const quit = () => {
    if (changed.current) {
      modal.confirm({
        title: '文章已修改，是否保存？',
        onOk: () => {
          saveArticle();
          navigate(-1);
        },
        onCancel: () => {
          navigate(-1);
        }
      })
    } else {
      navigate(-1);
    }
  }
  
  const linkedArticles = useMemo(() => {
    return editingArticle?.links.map(id => articles.find(article => article.id === id)) as IArticle[];
  }, [articles, editingArticle?.links]);

  useEffect(() => {
    if (!editingArticleId) return;
    initArticle(editingArticleId).then(initArticle => {
      originalArticle.current = initArticle;
      editorRef.current?.setEditorValue(initArticle.content);
    });
  }, [editingArticleId, initArticle]);

  useEffect(() => {
    if (!originalArticle.current || !editingArticle) return;
    changed.current = isArticleChanged(originalArticle.current, editingArticle);
  }, [editingArticle]);

  if (initLoading) {
    return (
      <div className={styles.loading}>
        <Spin />
      </div>
    )
  }
  if (!editingArticle) {
    return (
      <div className={styles.empty}>
        <Empty description={'未查询到相关文章'} />
      </div>
    )
  }

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
      </div>
      <div className={styles.contentContainer}>
        <Editor
          ref={editorRef}
          onChange={onContentChange}
          initValue={editingArticle.content}
          readonly={readonly}
        />
        <AddTag
          className={styles.tags}
          tags={editingArticle.tags}
          addTag={onAddTag}
          removeTag={onRemoveTag}
          readonly={readonly}
        />
        <div className={styles.linkArticles}>
          <For
            data={linkedArticles}
            renderItem={(article) => <ArticleCard article={article} />}
          />
        </div>
      </div>
      <FloatButton.Group shape={'square'}>
        <FloatButton
          icon={<SaveOutlined />}
          onClick={saveArticle}
          tooltip={'保存'}
        />
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
        <FloatButton
          icon={<IoExitOutline />}
          onClick={quit}
          tooltip={'返回'}
        />
      </FloatButton.Group>
    </div>
  )
}

export default ArticleEdit;