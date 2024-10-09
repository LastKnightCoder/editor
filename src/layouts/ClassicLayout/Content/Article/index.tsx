import { useEffect, useMemo, useRef, memo, useState } from "react";
import { useMemoizedFn, useRafInterval, useThrottleFn } from "ahooks";

import Editor, { EditorRef } from "@/components/Editor";
import AddTag from "@/components/AddTag";
import EditText from "@/components/EditText";
import StatusBar from "@/components/StatusBar";
import { CalendarOutlined, EditOutlined, ReadOutlined } from "@ant-design/icons";
import LocalImage from "@editor/components/LocalImage";
import EditorOutline from "@/layouts/ClassicLayout/components/EditorOutline";

import useUploadImage from "@/hooks/useUploadImage";
import { getInlineElementText } from "@/utils";
import { formatDate } from "@/utils/time";
import { HeaderElement } from "@editor/types";
import useEditArticle from "@/hooks/useEditArticle";

import { cardLinkExtension, fileAttachmentExtension } from '@/editor-extensions';
import useArticleManagementStore from "@/stores/useArticleManagementStore";

import styles from './index.module.less';
import { Tooltip } from "antd";
import { MdFormatIndentDecrease, MdFormatIndentIncrease, MdOutlineCode } from "react-icons/md";
import EditorSourceValue from "@/components/EditorSourceValue";
import { isValid } from "@/components/WhiteBoard/utils";

const extensions = [cardLinkExtension, fileAttachmentExtension];
const OUTLINE_SHOW_WIDTH_THRESHOLD = 1080;

const EditArticle = memo(() => {
  const {
    activeArticleId,
  } = useArticleManagementStore(state => ({
    activeArticleId: state.activeArticleId,
  }));

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
   } = useEditArticle(activeArticleId);

  const editorRef = useRef<EditorRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showOutline, setShowOutline] = useState(false);
  const [readonly, setReadonly] = useState(true);
  const [editorSourceValueOpen, setEditorSourceValueOpen] = useState(false);

  const uploadImage = useUploadImage();

  const headers: Array<{
    level: number;
    title: string;
  }> = useMemo(() => {
    if (!editingArticle || !editingArticle.content) return [];
    const headers = editingArticle.content.filter(node => node.type === 'header') as HeaderElement[];
    return headers.map((header) => ({
      level: header.level,
      title: header.children.map(getInlineElementText).join(''),
    }));
  }, [editingArticle]);

  const statusBarConfigs = useMemo(() => {
    const container = containerRef.current;
    if (!container) return [];
    const { width } = container.getBoundingClientRect();
    return [{
      key: 'words-count',
      children: (
        <>
          字数：{wordsCount}
        </>
      )
    },{
      key: 'readonly',
      children: (
        <>
          {
            readonly ? (
              <Tooltip title={'编辑'}>
                <EditOutlined />
              </Tooltip>
            ) : (
              <Tooltip title={'预览'}>
                <ReadOutlined />
              </Tooltip>
            )
          }
        </>
      ),
      onClick: () => {
        setReadonly(!readonly);
      }
    }, headers.length > 0 && width > OUTLINE_SHOW_WIDTH_THRESHOLD ? {
      key: 'outline',
      children: (
        <>
          {
            showOutline ? (
              <Tooltip title={'隐藏目录'}>
                <MdFormatIndentIncrease className={styles.icon} />
              </Tooltip>
            ) : (
              <Tooltip title={'显示目录'}>
                <MdFormatIndentDecrease className={styles.icon} />
              </Tooltip>
            )
          }
        </>
      ),
      onClick: () => {
        setShowOutline(!showOutline);
      }
    } : undefined, {
      key: 'source',
      children: (
        <>
          <Tooltip title={'源码'}>
            <MdOutlineCode className={styles.icon} />
          </Tooltip>
        </>
      ),
      onClick: () => {
        setEditorSourceValueOpen(true);
      }
    }].filter(isValid)
  }, [headers.length, readonly, showOutline, wordsCount]);

  const { run: handleContentResize } = useThrottleFn((entries: ResizeObserverEntry[]) => {
    const { width } = entries[0].contentRect;
    if (headers.length > 0 && width > OUTLINE_SHOW_WIDTH_THRESHOLD) {
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

  useRafInterval(() => {
    saveArticle()
  }, 3000);

  useEffect(() => {
    return () => {
      saveArticle();
    }
  }, [saveArticle]);

  const onClickHeader = useMemoizedFn((index: number) => {
    if (!editorRef.current) return;
    editorRef.current.scrollHeaderIntoView(index);
  })

  if (!editingArticle) {
    return null;
  }

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
      </div>
      <div className={styles.content}>
        <div className={styles.editor}>
          <Editor
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
      <StatusBar className={styles.statusBar} configs={statusBarConfigs} />
      <EditorSourceValue
        open={editorSourceValueOpen}
        onClose={() => { setEditorSourceValueOpen(false); }}
        content={editingArticle.content}
      />
    </div>
  )
});

export default EditArticle;
