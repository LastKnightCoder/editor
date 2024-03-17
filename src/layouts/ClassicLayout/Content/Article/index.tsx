import { useEffect, useMemo, useRef, memo } from "react";
import { Descendant, Editor } from "slate";
import { useMemoizedFn, useRafInterval, useSize } from "ahooks";
import { motion } from "framer-motion";
import classnames from 'classnames';

import If from "@/components/If";
import ArticleEditor, { EditorRef } from "@/components/Editor";
import AddTag from "@/components/AddTag";
import Outline from "@/components/Outline";
import EditText from "@/components/EditText";
import { CalendarOutlined } from "@ant-design/icons";

import useUploadImage from "@/hooks/useUploadImage";

import { formatDate } from "@/utils/time";

import { IArticle } from "@/types";

import styles from './index.module.less';

interface IArticleItemProps {
  initValue: Descendant[],
  editingArticle?: IArticle,
  wordsCount: number,
  onContentChange: (content: Descendant[], editor: Editor) => void,
  onInit: (editor: Editor, content: Descendant[]) => void,
  onDeleteTag: (tag: string) => void,
  onAddTag: (tag: string) => void,
  onTitleChange: (value: string) => void,
  saveArticle: () => void,
  readonly: boolean,
}

const outlineVariants = {
  open: {
    width: 'fit-content',
  },
  close: {
    width: 0,
  }
}

const EditArticle = memo((props: IArticleItemProps) => {
  const {
    initValue,
    editingArticle,
    wordsCount,
    onContentChange,
    onInit,
    onDeleteTag,
    onAddTag,
    onTitleChange,
    saveArticle,
    readonly,
  } = props;

  const editorRef = useRef<EditorRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const uploadImage = useUploadImage();
  const size = useSize(containerRef.current);

  const headers: Array<{
    level: number;
    title: string;
  }> = useMemo(() => {
    if (!editingArticle || !editingArticle.content) return [];
    const headers =  editingArticle.content.filter(node => node.type === 'header');
    return headers.map((header: any) => ({
      level: header.level,
      title: header.children.map((node: { text: string }) => node.text).join(''),
    }));
  }, [editingArticle]);

  const showOutline = useMemo(() => {
    if (!size) return false;
    return headers.length > 0 && size.width > 720;
  }, [headers, size]);

  useRafInterval(() => {
    saveArticle()
  }, 1000);

  useEffect(() => {
    return () => {
      saveArticle();
    }
  }, [saveArticle]);

  const onClickHeader = useMemoizedFn((index: number) => {
    if (!editorRef.current) return;
    editorRef.current.scrollHeaderIntoView(index);
  })

  if (!editingArticle) return null;

  return (
    <div ref={containerRef} className={styles.editArticleContainer}>
      <div className={styles.cover} style={{
        backgroundImage: `url(${editingArticle.bannerBg || 'https://cdn.jsdelivr.net/gh/LastKnightCoder/ImgHosting2/20210402153806.png'})`,
      }}>
        <EditText
          className={styles.title}
          defaultValue={editingArticle.title || '默认标题'}
          onChange={onTitleChange}
          onPressEnter={() => {
            editorRef.current?.focus();
          }}
          contentEditable={!readonly}
        />
        <div className={styles.metaInfo}>
          <div className={styles.meta}>
            <CalendarOutlined />
            <span className={styles.date}>
              创建于{formatDate(editingArticle.create_time, true)}
            </span>
          </div>
          <div className={styles.divider}>|</div>
          <div className={styles.meta}>
            <CalendarOutlined />
            <span className={styles.date}>
              更新于{formatDate(editingArticle.update_time, true)}
            </span>
          </div>
        </div>
        <div>
          {wordsCount}字
        </div>
      </div>
      <div className={styles.content}>
        <div className={styles.editor}>
          <ArticleEditor
            key={editingArticle.id}
            ref={editorRef}
            initValue={initValue}
            onInit={onInit}
            onChange={onContentChange}
            uploadImage={uploadImage}
            readonly={readonly}
          />
          <AddTag readonly={readonly} tags={editingArticle.tags} addTag={onAddTag} removeTag={onDeleteTag} />
        </div>
        <If condition={showOutline}>
          <motion.div
            animate={showOutline ? 'open' : 'close'}
            variants={outlineVariants}
            className={classnames(styles.outline)}
          >
            <Outline style={{ marginRight: 50 }} headers={headers} onClick={onClickHeader} />
          </motion.div>
        </If>
      </div>
    </div>
  )
});

export default EditArticle;
