import { useEffect, useMemo, useRef } from "react";
import { useMemoizedFn, useRafInterval, useSize } from "ahooks";
import { motion } from "framer-motion";
import { Empty, Spin } from "antd";
import classnames from 'classnames';

import Editor, { EditorRef } from "@/components/Editor";
import AddTag from "@/components/AddTag";
import Outline from "@/components/Outline";
import EditText from "@/components/EditText";
import { CalendarOutlined } from "@ant-design/icons";

import useEditArticle from "@/pages/Articles/useEditArticle";
import useUploadImage from "@/hooks/useUploadImage";

import { formatDate } from "@/utils/time";

import styles from './index.module.less';
import If from "@/components/If";

interface IArticleItemProps {
  articleId: number;
}

const outlineVariants = {
  open: {
    width: 'fit-content',
  },
  close: {
    width: 0,
  }
}

const EditArticle = (props: IArticleItemProps) => {
  const { articleId } = props;

  const editorRef = useRef<EditorRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    initValue,
    editingArticle,
    wordsCount,
    initLoading,
    onContentChange,
    onInit,
    onDeleteTag,
    onAddTag,
    onTitleChange,
    saveArticle
  } = useEditArticle(articleId);

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

  if (initLoading) return <Spin />

  if (!editingArticle) {
    return (
      <div className={styles.empty}>
        <Empty description={'未查询到数据'} />
      </div>
    )
  }

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
          contentEditable={true}
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
          <Editor
            ref={editorRef}
            initValue={initValue}
            onInit={onInit}
            onChange={onContentChange}
            uploadImage={uploadImage}
            readonly={false}
          />
          <AddTag tags={editingArticle.tags} addTag={onAddTag} removeTag={onDeleteTag} />
        </div>
        <If condition={showOutline}>
          <motion.div
            animate={showOutline ? 'open' : 'close'}
            variants={outlineVariants}
            className={classnames(styles.outline)}
          >
            <Outline headers={headers} onClick={onClickHeader} />
          </motion.div>
        </If>
      </div>
    </div>
  )
}

export default EditArticle;
