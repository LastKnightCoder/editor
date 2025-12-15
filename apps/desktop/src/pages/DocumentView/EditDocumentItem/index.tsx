import { useRef, useState, useEffect, useMemo, memo } from "react";
import { Tooltip } from "antd";
import { Descendant } from "slate";
import { useCreation, useMemoizedFn, useRafInterval, useUnmount } from "ahooks";
import classnames from "classnames";

import { Editor, EditorRef } from "@tau/editor/src";
import EditorSourceValue from "@/components/EditorSourceValue";
import ImmersiveEditorMode from "@/components/ImmersiveEditorMode";

import useEditDoc from "./useEditDoc";
import useEditContent from "@/hooks/useEditContent";

import { EditOutlined, ReadOutlined } from "@ant-design/icons";
import {
  MdFormatIndentIncrease,
  MdFormatIndentDecrease,
  MdOutlineCode,
} from "react-icons/md";
import { Maximize2 } from "lucide-react";

import { formatDate, defaultDocumentItemEventBus } from "@/utils";

import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
  chatReferenceExtension,
  createDocumentCardListExtension,
} from "@/editor-extensions";
const customExtensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
  chatReferenceExtension,
];
import styles from "./index.module.less";
import EditorOutline from "@/components/EditorOutline";
import { EditCardContext } from "@/context.ts";
import EditText, { EditTextHandle } from "@/components/EditText";
import ErrorBoundary from "@/components/ErrorBoundary";
interface EditDocumentItemProps {
  documentItemId: number;
}

const EditDocumentItem = memo((props: EditDocumentItemProps) => {
  const { documentItemId } = props;
  const titleRef = useRef<EditTextHandle>(null);
  const editorRef = useRef<EditorRef>(null);
  const [readonly, setReadonly] = useState(false);
  const [immersiveMode, setImmersiveMode] = useState(false);
  const documentItemEventBus = useCreation(
    () => defaultDocumentItemEventBus.createEditor(),
    [],
  );

  const outlineRef = useRef<HTMLDivElement>(null);
  const [editorSourceValueOpen, setEditorSourceValueOpen] = useState(false);

  const extensions = useCreation(() => {
    return [
      ...customExtensions,
      createDocumentCardListExtension(documentItemId),
    ];
  }, [documentItemId]);

  const {
    documentItem,
    saveDocument,
    onInit,
    onContentChange: onContentChangeFromEditDoc,
    onTitleChange,
    initValue,
    setDocumentItem,
  } = useEditDoc(documentItemId);

  const { throttleHandleEditorContentChange } = useEditContent(
    documentItem?.contentId,
    (content) => {
      editorRef.current?.setEditorValue(content);
    },
  );

  useEffect(() => {
    if (!documentItemId) return;

    const unsubscribe = documentItemEventBus.subscribeToDocumentItemWithId(
      "document-item:updated",
      documentItemId,
      (data) => {
        setDocumentItem(data.documentItem);
        if (!data.documentItem) return;
        if (data.documentItem.title !== documentItem?.title) {
          titleRef.current?.setValue(data.documentItem.title);
        }
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
    if (readonly) return;
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
    if (!readonly) {
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
            <ErrorBoundary>
              <Editor
                key={documentItem.id}
                ref={editorRef}
                initValue={initValue}
                onChange={onContentChange}
                readonly={readonly}
                extensions={extensions}
                onInit={onInit}
              />
            </ErrorBoundary>
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
        <div className={styles.item}>
          <Tooltip title={"沉浸模式"}>
            <Maximize2
              size={14}
              className={styles.icon}
              onClick={() => setImmersiveMode(true)}
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
      {immersiveMode && (
        <ImmersiveEditorMode
          initValue={documentItem.content}
          onChange={onContentChange}
          onInit={onInit}
          onExit={() => {
            setImmersiveMode(false);
            // 退出沉浸模式时，同步更新主编辑器内容（Editor 是非受控组件）
            editorRef.current?.setEditorValue(documentItem.content);
          }}
          wordCount={documentItem.count}
          readonly={readonly}
          extensions={extensions}
        />
      )}
    </div>
  );
});

export default EditDocumentItem;
