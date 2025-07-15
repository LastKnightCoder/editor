import { useRef, useState, useEffect, useMemo, memo } from "react";
import { Tooltip } from "antd";
import { Descendant } from "slate";
import { useCreation, useMemoizedFn, useRafInterval, useUnmount } from "ahooks";
import classnames from "classnames";

import Editor, { EditorRef } from "@/components/Editor";
import EditorSourceValue from "@/components/EditorSourceValue";

import useUploadResource from "@/hooks/useUploadResource.ts";
import useEditDoc from "./useEditDoc";
import { useWindowFocus } from "@/hooks/useWindowFocus";
import useEditContent from "@/hooks/useEditContent";

import { EditOutlined, ReadOutlined } from "@ant-design/icons";
import {
  MdFormatIndentIncrease,
  MdFormatIndentDecrease,
  MdOutlineCode,
} from "react-icons/md";

import { formatDate, defaultDocumentItemEventBus } from "@/utils";
import {
  contentLinkExtension,
  documentCardListExtension,
  fileAttachmentExtension,
  questionCardExtension,
} from "@/editor-extensions";

import styles from "./index.module.less";
import EditorOutline from "@/components/EditorOutline";
import { EditCardContext } from "@/context.ts";
import EditText, { EditTextHandle } from "@/components/EditText";

const extensions = [
  contentLinkExtension,
  documentCardListExtension,
  fileAttachmentExtension,
  questionCardExtension,
];

interface EditDocumentItemProps {
  documentItemId: number;
}

const EditDocumentItem = memo((props: EditDocumentItemProps) => {
  const { documentItemId } = props;
  const titleRef = useRef<EditTextHandle>(null);
  const editorRef = useRef<EditorRef>(null);
  const [readonly, setReadonly] = useState(false);
  const documentItemEventBus = useCreation(
    () => defaultDocumentItemEventBus.createEditor(),
    [],
  );

  const outlineRef = useRef<HTMLDivElement>(null);
  const [editorSourceValueOpen, setEditorSourceValueOpen] = useState(false);
  const isWindowFocused = useWindowFocus();

  const {
    documentItem,
    saveDocument,
    onInit,
    onContentChange: onContentChangeFromEditDoc,
    onTitleChange,
    initValue,
    setDocumentItem,
    prevDocument,
  } = useEditDoc(documentItemId);

  const { throttleHandleEditorContentChange } = useEditContent(
    documentItem?.contentId,
    (content) => {
      editorRef.current?.setEditorValue(content);
    },
  );

  const uploadResource = useUploadResource();

  useEffect(() => {
    if (!documentItemId) return;

    const unsubscribe = documentItemEventBus.subscribeToDocumentItemWithId(
      "document-item:updated",
      documentItemId,
      (data) => {
        titleRef.current?.setValue(data.documentItem.title);
        setDocumentItem(data.documentItem);
        prevDocument.current = data.documentItem;
      },
    );

    return () => {
      unsubscribe();
    };
  }, [documentItemId, documentItemEventBus, setDocumentItem]);

  const handleOnPressEnter = useMemoizedFn(async () => {
    if (!documentItem) return;
    titleRef.current?.blur();
    editorRef.current?.focus();
    // 保存文档
    const updatedDocumentItem = await saveDocument();
    if (updatedDocumentItem) {
      documentItemEventBus.publishDocumentItemEvent(
        "document-item:updated",
        updatedDocumentItem,
      );
    }
  });

  useRafInterval(async () => {
    if (!isWindowFocused || readonly) return;
    const updatedDocumentItem = await saveDocument();
    if (updatedDocumentItem) {
      documentItemEventBus.publishDocumentItemEvent(
        "document-item:updated",
        updatedDocumentItem,
      );
    }
  }, 1000);

  useUnmount(async () => {
    if (readonly) return;
    throttleHandleEditorContentChange.flush();
    const updatedDocumentItem = await saveDocument();
    if (updatedDocumentItem) {
      documentItemEventBus.publishDocumentItemEvent(
        "document-item:updated",
        updatedDocumentItem,
      );
    }
  });

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    if (isWindowFocused && editorRef.current?.isFocus() && !readonly) {
      throttleHandleEditorContentChange(content);
    }
    onContentChangeFromEditDoc(content);
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
            onChange={onTitleChange}
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
              onChange={onContentChange}
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
