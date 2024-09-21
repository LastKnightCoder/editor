import { useEffect, useMemo, useRef, memo, useState } from "react";
import { Descendant, Editor } from "slate";
import { useMemoizedFn, useRafInterval, useThrottleFn } from "ahooks";

import ArticleEditor, { EditorRef } from "@/components/Editor";
import AddTag from "@/components/AddTag";
import EditText from "@/components/EditText";
import { CalendarOutlined } from "@ant-design/icons";
import LocalImage from "@editor/components/LocalImage";
import EditorOutline from "@/layouts/ClassicLayout/components/EditorOutline";

import useUploadImage from "@/hooks/useUploadImage";
import { getInlineElementText } from "@/utils";
import { formatDate } from "@/utils/time";
import { HeaderElement } from "@editor/types";
import { IArticle } from "@/types";

import { cardLinkExtension, fileAttachmentExtension } from '@/editor-extensions';

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

const extensions = [cardLinkExtension, fileAttachmentExtension];

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
  const [showOutline, setShowOutline] = useState(false);

  const uploadImage = useUploadImage();

  const headers: Array<{
    level: number;
    title: string;
  }> = useMemo(() => {
    if (!editingArticle || !editingArticle.content) return [];
    const headers =  editingArticle.content.filter(node => node.type === 'header') as HeaderElement[];
    return headers.map((header) => ({
      level: header.level,
      title: header.children.map(getInlineElementText).join(''),
    }));
  }, [editingArticle]);
  
  const { run: handleContentResize } = useThrottleFn((entries: ResizeObserverEntry[]) => {
    const { width } = entries[0].contentRect;
    if (headers.length > 0 && width > 1080) {
      setShowOutline(true);
    } else {
      setShowOutline(false);
    }
  }, { wait: 500 });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(handleContentResize);
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    }
  }, [handleContentResize, headers]);

  console.log('setShowOutline', showOutline);

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
      <div className={styles.cover}>
        <LocalImage key={editingArticle.bannerBg} url={editingArticle.bannerBg || 'https://cdn.jsdelivr.net/gh/LastKnightCoder/ImgHosting2/20210402153806.png'} className={styles.img} />
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
            extensions={extensions}
            onChange={onContentChange}
            uploadImage={uploadImage}
            readonly={readonly}
          />
          <AddTag readonly={readonly} tags={editingArticle.tags} addTag={onAddTag} removeTag={onDeleteTag}/>
        </div>
        <EditorOutline
          className={styles.outline}
          content={editingArticle.content}
          show={showOutline}
          onClickHeader={onClickHeader}
        />
      </div>
    </div>
  )
});

export default EditArticle;
