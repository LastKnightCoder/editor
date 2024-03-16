import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from 'framer-motion';
import { FloatButton, Spin, Empty } from "antd";
import { useRafInterval } from 'ahooks';

import { CalendarOutlined, EditOutlined, ReadOutlined, UpOutlined } from '@ant-design/icons';
import { HiOutlineMenuAlt3 } from 'react-icons/hi';
import { MdOutlineContentPasteGo } from 'react-icons/md';
import { IoExitOutline } from 'react-icons/io5';

import Editor, { EditorRef } from "@/components/Editor";
import EditorSourceValue from "@/components/EditorSourceValue";
import Outline from "@/components/Outline";
import AddTag from "@/components/AddTag";

import useEditArticle from "../useEditArticle";
import useUploadImage from "@/hooks/useUploadImage.ts";
import { formatDate } from "@/utils/time";

import styles from './index.module.less';

import { cardLinkExtension } from '@/editor-extensions';
const extensions = [cardLinkExtension];

const ArticleEdit = () => {
  const { articleId } = useParams();
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
  } = useEditArticle(Number(articleId));

  const [readonly, setReadonly] = useState<boolean>(true);

  const uploadImage = useUploadImage();

  const editorRef = useRef<EditorRef>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [editingTitle, setEditingTitle] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showOutline, setShowOutline] = useState<boolean>(true);
  const [showContentSource, setShowContentSource] = useState<boolean>(false);

  const navigate = useNavigate();

  useRafInterval(() => {
    saveArticle()
  }, 1000);

  useEffect(() => {
    return () => {
      saveArticle();
    }
  }, [saveArticle]);

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

  const outlineVariants = {
    open: {
      width: 280,
    },
    close: {
      width: 0,
    }
  }

  const toggleReadonly = () => {
    setReadonly(!readonly);
  }

  const scrollToTop = () => {
    containerRef.current?.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  const onClickHeader = (index: number) => {
    if (!editorRef.current) return;
    editorRef.current.scrollHeaderIntoView(index);
  }
  
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
      <div className={styles.cover} style={{
        backgroundImage: `url(${editingArticle.bannerBg || 'https://cdn.jsdelivr.net/gh/LastKnightCoder/ImgHosting2/20210402153806.png'})`,
      }}>
        <h1
          ref={titleRef}
          className={styles.title}
          // @ts-ignore
          contentEditable={!readonly ? 'plaintext-only' : false}
          suppressContentEditableWarning
          onFocus={() => setEditingTitle(true)}
          onBlur={(e) => {
            onTitleChange(e.target.innerText);
            setEditingTitle(false);
          }}
        >
          {editingArticle.title || '无标题'}
        </h1>
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
        <div className={styles.me}>
          {wordsCount}字
        </div>
      </div>
      <div className={styles.contentContainer}>
        <div className={styles.leftPart}>
          <div className={styles.article}>
            <Editor
              ref={editorRef}
              key={editingArticle.id}
              onInit={onInit}
              onChange={onContentChange}
              initValue={initValue}
              readonly={readonly}
              extensions={extensions}
              uploadImage={uploadImage}
            />
            <AddTag
              className={styles.tags}
              tags={editingArticle.tags}
              addTag={onAddTag}
              removeTag={onDeleteTag}
              readonly={readonly}
            />
          </div>
        </div>
        <motion.div animate={showOutline && headers.length > 0 ? 'open' : 'close'} variants={outlineVariants} className={styles.rightPart}>
          <Outline className={styles.outline} headers={headers} onClick={onClickHeader} />
        </motion.div>
      </div>
      <FloatButton.Group shape={'square'}>
        <FloatButton
          icon={readonly ? <EditOutlined /> : <ReadOutlined />}
          onClick={toggleReadonly}
          tooltip={readonly ? '编辑' : '只读'}
        />
        <FloatButton
          icon={<HiOutlineMenuAlt3 />}
          onClick={() => setShowOutline(!showOutline)}
          tooltip={showOutline ? '隐藏大纲' : '显示大纲'}
        />
        <FloatButton
          icon={<MdOutlineContentPasteGo />}
          onClick={() => setShowContentSource(!showContentSource)}
          tooltip={showContentSource ? '隐藏源码' : '显示源码'}
        />
        <FloatButton
          icon={<UpOutlined />}
          onClick={scrollToTop}
          tooltip={'回到顶部'}
        />
        <FloatButton
          icon={<IoExitOutline />}
          onClick={() => {
            navigate(-1);
          }}
          tooltip={'返回'}
        />
      </FloatButton.Group>
      <EditorSourceValue
        open={showContentSource}
        onClose={() => { setShowContentSource(false) }}
        content={editingArticle.content}
      />
    </div>
  )
}

export default ArticleEdit;