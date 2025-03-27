import { useEffect, useMemo, useRef, memo, useState } from "react";
import { Tooltip } from "antd";
import {
  useMemoizedFn,
  useRafInterval,
  useThrottleFn,
  useSize,
  useCreation,
} from "ahooks";
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
  MenuUnfoldOutlined,
  ReadOutlined,
} from "@ant-design/icons";
import LocalImage from "@/components/LocalImage";
import CoverEditor from "@/components/CoverEditor";
import EditorOutline from "@/components/EditorOutline";
import {
  getInlineElementText,
  formatDate,
  defaultArticleEventBus,
} from "@/utils";

import { HeaderElement } from "@editor/types";

import useEditArticle from "@/hooks/useEditArticle.ts";
import useUploadResource from "@/hooks/useUploadResource.ts";
import {
  cardLinkExtension,
  fileAttachmentExtension,
} from "@/editor-extensions";

import styles from "./index.module.less";
import { EditCardContext } from "@/context.ts";
import { produce } from "immer";
import { Descendant } from "slate";
import { useWindowFocus } from "@/hooks/useWindowFocus";
import useArticleManagementStore from "@/stores/useArticleManagementStore";
import classnames from "classnames";
const extensions = [cardLinkExtension, fileAttachmentExtension];
const OUTLINE_SHOW_WIDTH_THRESHOLD = 1080;

interface IEditArticleProps {
  articleId: number;
  defaultReadonly?: boolean;
}

const EditArticle = memo((props: IEditArticleProps) => {
  const { articleId, defaultReadonly = true } = props;
  const isWindowFocused = useWindowFocus();

  const {
    initValue,
    editingArticle,
    onContentChange,
    onInit,
    onDeleteTag,
    onAddTag,
    onTitleChange,
    saveArticle,
    setEditingArticle,
  } = useEditArticle(articleId);

  const articleEventBus = useCreation(
    () => defaultArticleEventBus.createEditor(),
    [],
  );
  const editorRef = useRef<EditorRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showOutline, setShowOutline] = useState(false);
  const [readonly, setReadonly] = useState(defaultReadonly);
  const [editorSourceValueOpen, setEditorSourceValueOpen] = useState(false);
  const titleRef = useRef<EditTextHandle>(null);
  const size = useSize(containerRef);
  const hideArticleList = useArticleManagementStore(
    (state) => state.hideArticleList,
  );

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

  useEffect(() => {
    if (!articleId) return;

    const unsubscribe = articleEventBus.subscribeToArticleWithId(
      "article:updated",
      articleId,
      (data) => {
        setEditingArticle(data.article);
        editorRef.current?.setEditorValue(data.article.content);
        titleRef.current?.setValue(data.article.title);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [articleId, articleEventBus]);

  const handleOnEditorContentChange = useMemoizedFn((content: Descendant[]) => {
    if (
      !editingArticle ||
      !editorRef.current ||
      !editorRef.current.isFocus() ||
      !isWindowFocused
    )
      return;
    onContentChange(content);
    articleEventBus.publishArticleEvent("article:updated", {
      ...editingArticle,
      content,
    });
  });

  const handleOnTitleChange = useMemoizedFn((title: string) => {
    if (
      !editingArticle ||
      !titleRef.current ||
      !titleRef.current.isFocus() ||
      !isWindowFocused
    )
      return;
    onTitleChange(title);
    articleEventBus.publishArticleEvent("article:updated", {
      ...editingArticle,
      title,
    });
  });

  const handleAddTag = useMemoizedFn((tag: string) => {
    if (!editingArticle || editingArticle.tags.includes(tag)) return;
    onAddTag(tag);
    articleEventBus.publishArticleEvent("article:updated", {
      ...editingArticle,
      tags: [...editingArticle.tags, tag],
    });
  });

  const handleDeleteTag = useMemoizedFn((tag: string) => {
    if (!editingArticle || !editingArticle.tags.includes(tag)) return;
    onDeleteTag(tag);
    articleEventBus.publishArticleEvent("article:updated", {
      ...editingArticle,
      tags: editingArticle.tags.filter((t) => t !== tag),
    });
  });

  useRafInterval(() => {
    if (
      !editingArticle ||
      (!editorRef.current?.isFocus() && !titleRef.current?.isFocus()) ||
      !isWindowFocused
    )
      return;
    saveArticle();
  }, 3000);

  useEffect(() => {
    return () => {
      saveArticle(true);
    };
  }, [saveArticle]);

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
    articleEventBus.publishArticleEvent("article:updated", newEditingArticle);
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
          key={editingArticle.id}
          className={styles.title}
          defaultValue={editingArticle.title || "默认标题"}
          onChange={handleOnTitleChange}
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
        <div
          className={classnames(styles.unfoldMenu, {
            [styles.hide]: !hideArticleList,
          })}
          onClick={() => {
            useArticleManagementStore.setState({
              hideArticleList: false,
            });
          }}
        >
          <MenuUnfoldOutlined />
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
              onChange={handleOnEditorContentChange}
              uploadResource={uploadResource}
              readonly={readonly}
            />
          </EditCardContext.Provider>
          <AddTag
            style={{ marginTop: 20 }}
            readonly={readonly}
            tags={editingArticle.tags}
            addTag={handleAddTag}
            removeTag={handleDeleteTag}
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
