import { useRef, useState, useEffect, useMemo, memo } from "react";
import { Tooltip } from "antd";
import { useCreation, useMemoizedFn, useRafInterval, useUnmount } from "ahooks";
import classnames from "classnames";

import Editor, { EditorRef } from "@/components/Editor";
import EditorSourceValue from "@/components/EditorSourceValue";

import useUploadResource from "@/hooks/useUploadResource.ts";
import useEditDoc from "./useEditDoc";
import { useWindowFocus } from "@/hooks/useWindowFocus";

import { EditOutlined, ReadOutlined } from "@ant-design/icons";
import {
  MdFormatIndentIncrease,
  MdFormatIndentDecrease,
  MdOutlineCode,
} from "react-icons/md";

import { formatDate, defaultDocumentItemEventBus } from "@/utils";
import {
  cardLinkExtension,
  documentCardListExtension,
  fileAttachmentExtension,
} from "@/editor-extensions";

import styles from "./index.module.less";
import EditorOutline from "@/components/EditorOutline";
import { EditCardContext } from "@/context.ts";
import EditText, { EditTextHandle } from "@/components/EditText";
import { Descendant } from "slate";
import useDocumentsStore from "@/stores/useDocumentsStore";

const extensions = [
  cardLinkExtension,
  documentCardListExtension,
  fileAttachmentExtension,
];

const EditDocumentItem = memo(() => {
  const titleRef = useRef<EditTextHandle>(null);
  const editorRef = useRef<EditorRef>(null);
  const [readonly, setReadonly] = useState(false);
  const documentItemEventBus = useCreation(
    () => defaultDocumentItemEventBus.createEditor(),
    [],
  );

  const activeDocumentItemId = useDocumentsStore(
    (state) => state.activeDocumentItemId,
  );
  const outlineRef = useRef<HTMLDivElement>(null);
  const [editorSourceValueOpen, setEditorSourceValueOpen] = useState(false);
  const isWindowFocused = useWindowFocus();

  const {
    documentItem,
    saveDocument,
    onInit,
    onContentChange,
    onTitleChange,
    initValue,
    setDocumentItem,
  } = useEditDoc(activeDocumentItemId);

  const uploadResource = useUploadResource();

  useEffect(() => {
    if (!activeDocumentItemId) return;

    const unsubscribe = documentItemEventBus.subscribeToDocumentItemWithId(
      "document-item:updated",
      activeDocumentItemId,
      (data) => {
        editorRef.current?.setEditorValue(data.documentItem.content);
        titleRef.current?.setValue(data.documentItem.title);
        setDocumentItem(data.documentItem);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [activeDocumentItemId, documentItemEventBus, setDocumentItem]);

  const handleOnTitleChange = useMemoizedFn((title: string) => {
    if (!documentItem || !titleRef.current?.isFocus() || !isWindowFocused)
      return;
    onTitleChange(title);
    documentItemEventBus.publishDocumentItemEvent("document-item:updated", {
      ...documentItem,
      title,
    });
  });

  const handleOnPressEnter = useMemoizedFn(() => {
    if (!documentItem) return;
    titleRef.current?.blur();
    editorRef.current?.focus();
  });

  const handleContentChange = useMemoizedFn((content: Descendant[]) => {
    if (!documentItem || !editorRef.current?.isFocus() || !isWindowFocused)
      return;
    onContentChange(content);
    documentItemEventBus.publishDocumentItemEvent("document-item:updated", {
      ...documentItem,
      content,
    });
  });

  useRafInterval(() => {
    if (
      !isWindowFocused ||
      readonly ||
      (!editorRef.current?.isFocus() && !titleRef.current?.isFocus())
    )
      return;
    saveDocument();
  }, 3000);

  useUnmount(() => {
    if (readonly) return;
    onContentChange.flush();
    saveDocument();
  });

  const headers: Array<{
    level: number;
    title: string;
  }> = useMemo(() => {
    if (!documentItem || !documentItem.content) return [];
    const headers = documentItem.content.filter(
      (node) => node.type === "header",
    );
    return headers.map((header: any) => ({
      level: header.level,
      title: header.children
        .map((node: { text: string }) => node.text)
        .join(""),
    }));
  }, [documentItem]);

  const [outlineOpen, setOutlineOpen] = useState(() => {
    if (!documentItem) return false;
    return headers.length > 0;
  });

  const onClickHeader = (index: number) => {
    if (!editorRef.current) return;
    editorRef.current.scrollHeaderIntoView(index);
  };

  if (!documentItem) {
    return null;
  }

  return (
    <div className={styles.editDocContainer}>
      <div className={styles.editDoc}>
        <div className={styles.editorContainer}>
          <EditText
            className={styles.title}
            ref={titleRef}
            contentEditable={true}
            defaultValue={documentItem.title}
            onChange={handleOnTitleChange}
            onPressEnter={handleOnPressEnter}
          />
          <div className={styles.time}>
            <div>创建于 {formatDate(documentItem.createTime, true)}</div>
            <div>最后修改于 {formatDate(documentItem.updateTime, true)}</div>
          </div>
          <EditCardContext.Provider
            value={{
              cardId: -1,
            }}
          >
            <Editor
              key={documentItem.id}
              ref={editorRef}
              initValue={initValue}
              onChange={handleContentChange}
              readonly={readonly}
              uploadResource={uploadResource}
              extensions={extensions}
              onInit={onInit}
            />
          </EditCardContext.Provider>
        </div>
        <EditorOutline
          className={classnames(styles.outline, {
            [styles.hide]: !outlineOpen,
          })}
          content={documentItem.content}
          show={outlineOpen}
          onClickHeader={onClickHeader}
        />
      </div>
      <div className={styles.statusBar}>
        <div
          style={{
            lineHeight: "20px",
            fontSize: 14,
            opacity: 0.8,
          }}
        >
          <div>字数：{documentItem.count}</div>
        </div>
        <div className={styles.item}>
          {readonly ? (
            <Tooltip title={"编辑"}>
              <EditOutlined
                className={styles.icon}
                onClick={() => setReadonly(false)}
              />
            </Tooltip>
          ) : (
            <Tooltip title={"预览"}>
              <ReadOutlined
                className={styles.icon}
                onClick={() => setReadonly(true)}
              />
            </Tooltip>
          )}
        </div>
        <div className={styles.item}>
          {outlineOpen ? (
            <Tooltip title={"隐藏目录"}>
              <MdFormatIndentIncrease
                className={styles.icon}
                onClick={() => {
                  if (outlineRef.current) {
                    const clientWidth = outlineRef.current.clientWidth;
                    outlineRef.current.style.width = `${clientWidth}px`;
                    outlineRef.current.style.overflow = "hidden";
                  }
                  setOutlineOpen(false);
                }}
              />
            </Tooltip>
          ) : (
            <Tooltip title={"显示目录"}>
              <MdFormatIndentDecrease
                className={styles.icon}
                onClick={() => {
                  setOutlineOpen(true);
                  setTimeout(() => {
                    if (outlineRef.current) {
                      outlineRef.current.style.width = "auto";
                      outlineRef.current.style.overflow = "visible";
                      outlineRef.current.style.position = "static";
                    }
                  }, 300);
                }}
              />
            </Tooltip>
          )}
        </div>
        <div className={styles.item}>
          <Tooltip title={"源码"}>
            <MdOutlineCode
              className={styles.icon}
              onClick={() => setEditorSourceValueOpen(true)}
            />
          </Tooltip>
        </div>
      </div>
      <EditorSourceValue
        open={editorSourceValueOpen}
        onClose={() => {
          setEditorSourceValueOpen(false);
        }}
        content={documentItem.content}
      />
    </div>
  );
});

export default EditDocumentItem;
