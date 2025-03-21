import { useEffect, useMemo, useRef, memo, useState } from "react";
import { Tooltip } from "antd";
import { useMemoizedFn, useRafInterval, useThrottleFn, useSize } from "ahooks";

import Editor, { EditorRef } from "@editor/index.tsx";
import AddTag from "@/components/AddTag";
import EditText, { EditTextHandle } from "@/components/EditText";
import StatusBar from "@/components/StatusBar";
import EditorSourceValue from "@/components/EditorSourceValue";
import { isValid } from "@/components/WhiteBoard/utils";
import {
  MdFormatIndentDecrease,
  MdFormatIndentIncrease,
  MdOutlineCode,
} from "react-icons/md";

import {
  CalendarOutlined,
  EditOutlined,
  ReadOutlined,
} from "@ant-design/icons";
import LocalImage from "@/components/LocalImage";
import CoverEditor from "@/components/CoverEditor";
import EditorOutline from "@/components/EditorOutline";
import { getInlineElementText } from "@/utils";
import { formatDate } from "@/utils/time.ts";

import { HeaderElement } from "@editor/types";

import useEditArticle from "@/hooks/useEditArticle.ts";
import useUploadResource from "@/hooks/useUploadResource.ts";
import {
  cardLinkExtension,
  fileAttachmentExtension,
} from "@/editor-extensions";
import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";
import useSettingStore from "@/stores/useSettingStore.ts";
import { on, off } from "@/electron";
import { findOneArticle } from "@/commands";

import styles from "./index.module.less";
import { EditCardContext } from "@/context.ts";
import { produce } from "immer";

const extensions = [cardLinkExtension, fileAttachmentExtension];
const OUTLINE_SHOW_WIDTH_THRESHOLD = 1080;

const EditArticle = memo(() => {
  const { activeArticleId } = useArticleManagementStore((state) => ({
    activeArticleId: state.activeArticleId,
  }));

  const { currentDatabaseName } = useSettingStore((state) => ({
    currentDatabaseName: state.setting.database.active,
  }));

  const {
    initValue,
    editingArticle,
    onContentChange,
    onInit,
    onDeleteTag,
    onAddTag,
    onTagsChange,
    onTitleChange,
    saveArticle,
    setEditingArticle,
  } = useEditArticle(activeArticleId);

  const editorRef = useRef<EditorRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showOutline, setShowOutline] = useState(false);
  const [readonly, setReadonly] = useState(true);
  const [editorSourceValueOpen, setEditorSourceValueOpen] = useState(false);
  const titleRef = useRef<EditTextHandle>(null);
  const size = useSize(containerRef);

  const uploadResource = useUploadResource();

  const headers: Array<{
    level: number;
    title: string;
  }> = useMemo(() => {
    if (!editingArticle || !editingArticle.content) return [];
    const headers = editingArticle.content.filter(
      (node) => node.type === "header",
    ) as HeaderElement[];
    return headers.map((header) => ({
      level: header.level,
      title: header.children.map(getInlineElementText).join(""),
    }));
  }, [editingArticle]);

  const statusBarConfigs = useMemo(() => {
    return [
      {
        key: "words-count",
        children: <>字数：{editingArticle?.count}</>,
      },
      {
        key: "readonly",
        children: (
          <>
            {readonly ? (
              <Tooltip title={"编辑"}>
                <EditOutlined />
              </Tooltip>
            ) : (
              <Tooltip title={"预览"}>
                <ReadOutlined />
              </Tooltip>
            )}
          </>
        ),
        onClick: () => {
          setReadonly(!readonly);
        },
      },
      size && size.width > OUTLINE_SHOW_WIDTH_THRESHOLD && headers.length > 0
        ? {
            key: "outline",
            children: (
              <>
                {showOutline ? (
                  <Tooltip title={"隐藏目录"}>
                    <MdFormatIndentIncrease className={styles.icon} />
                  </Tooltip>
                ) : (
                  <Tooltip title={"显示目录"}>
                    <MdFormatIndentDecrease className={styles.icon} />
                  </Tooltip>
                )}
              </>
            ),
            onClick: () => {
              setShowOutline(!showOutline);
            },
          }
        : undefined,
      {
        key: "source",
        children: (
          <>
            <Tooltip title={"源码"}>
              <MdOutlineCode className={styles.icon} />
            </Tooltip>
          </>
        ),
        onClick: () => {
          setEditorSourceValueOpen(true);
        },
      },
    ].filter(isValid);
  }, [headers.length, readonly, showOutline, size, editingArticle?.count]);

  const { run: handleContentResize } = useThrottleFn(
    (entries: ResizeObserverEntry[]) => {
      const { width } = entries[0].contentRect;
      if (headers.length > 0 && width > OUTLINE_SHOW_WIDTH_THRESHOLD) {
        setShowOutline(true);
      } else {
        setShowOutline(false);
      }
    },
    { wait: 500 },
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(handleContentResize);
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [handleContentResize, headers]);

  useRafInterval(() => {
    saveArticle();
  }, 3000);

  useEffect(() => {
    return () => {
      saveArticle();
    };
  }, [saveArticle]);

  useEffect(() => {
    const handleArticleWindowClosed = async (
      _event: any,
      data: { articleId: number; databaseName: string },
    ) => {
      if (
        data.articleId === activeArticleId &&
        data.databaseName === currentDatabaseName
      ) {
        const article = await findOneArticle(data.articleId);
        if (editorRef.current) {
          editorRef.current.setEditorValue(article.content);
        }
        if (titleRef.current) {
          titleRef.current.setValue(article.title);
        }
        setEditingArticle(article);
        onContentChange(article.content);
        onTitleChange(article.title);
        onTagsChange(article.tags);
      }
    };

    on("article-window-closed", handleArticleWindowClosed);

    return () => {
      off("article-window-closed", handleArticleWindowClosed);
    };
  }, [
    activeArticleId,
    currentDatabaseName,
    onContentChange,
    onTagsChange,
    onTitleChange,
    setEditingArticle,
  ]);

  const onClickHeader = useMemoizedFn((index: number) => {
    if (!editorRef.current) return;
    editorRef.current.scrollHeaderIntoView(index);
  });

  const handleCoverChange = useMemoizedFn((url: string, position: string) => {
    if (!editingArticle) return;
    const newEditingArticle = produce(editingArticle, (draft) => {
      draft.bannerBg = url;
      draft.bannerPosition = position;
    });
    setEditingArticle(newEditingArticle);
  });

  if (!editingArticle) {
    return null;
  }

  return (
    <div ref={containerRef} className={styles.editArticleContainer}>
      <div className={styles.cover}>
        <LocalImage
          key={editingArticle.bannerBg}
          url={
            editingArticle.bannerBg ||
            "https://cdn.jsdelivr.net/gh/LastKnightCoder/ImgHosting2/20210402153806.png"
          }
          className={styles.img}
          style={{
            objectPosition: `center ${
              editingArticle.bannerPosition === "top"
                ? "0%"
                : editingArticle.bannerPosition === "bottom"
                  ? "100%"
                  : editingArticle.bannerPosition === "center"
                    ? "center"
                    : editingArticle.bannerPosition // 支持自定义百分比
            }`,
          }}
        />
        <CoverEditor
          coverUrl={editingArticle.bannerBg || ""}
          coverPosition={editingArticle.bannerPosition || "center"}
          onCoverChange={handleCoverChange}
        />
        <EditText
          ref={titleRef}
          className={styles.title}
          defaultValue={editingArticle.title || "默认标题"}
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
          <EditCardContext.Provider
            value={{
              cardId: -1,
            }}
          >
            <Editor
              key={editingArticle.id}
              ref={editorRef}
              initValue={initValue}
              onInit={onInit}
              extensions={extensions}
              onChange={onContentChange}
              uploadResource={uploadResource}
              readonly={readonly}
            />
          </EditCardContext.Provider>
          <AddTag
            style={{ marginTop: 20 }}
            readonly={readonly}
            tags={editingArticle.tags}
            addTag={onAddTag}
            removeTag={onDeleteTag}
          />
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
        onClose={() => {
          setEditorSourceValueOpen(false);
        }}
        content={editingArticle.content}
      />
    </div>
  );
});

export default EditArticle;
