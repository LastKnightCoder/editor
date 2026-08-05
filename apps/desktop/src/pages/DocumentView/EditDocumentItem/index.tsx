import { useRef, useState, useEffect, useMemo, memo } from "react";
import { Tooltip } from "antd";
import { Descendant, Range, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { useCreation, useMemoizedFn, useRafInterval, useUnmount } from "ahooks";
import classnames from "classnames";

import { Editor, EditorRef } from "@tau/editor/src";
import EditorSourceValue from "@/components/EditorSourceValue";
import ImmersiveEditorMode, {
  type ImmersiveEditorExitPayload,
} from "@/components/ImmersiveEditorMode";

import useEditDoc from "./useEditDoc";
import useEditContent from "@/hooks/useEditContent";
import useRegisterActiveEditingContext from "@/hooks/useRegisterActiveEditingContext";

import { EditOutlined, ReadOutlined } from "@ant-design/icons";
import {
  MdFormatIndentIncrease,
  MdFormatIndentDecrease,
  MdOutlineCode,
} from "react-icons/md";
import { Maximize2 } from "lucide-react";

import { formatDate, defaultDocumentItemEventBus } from "@/utils";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";

import { createDocumentCardListExtension } from "@/editor-extensions";
import styles from "./index.module.less";
import EditorOutline from "@/components/EditorOutline";
import { EditCardContext } from "@/context.ts";
import EditText, { EditTextHandle } from "@/components/EditText";
import ErrorBoundary from "@/components/ErrorBoundary";

const cloneRange = (selection: Range | null): Range | null => {
  if (!selection) return null;
  return {
    anchor: {
      path: [...selection.anchor.path],
      offset: selection.anchor.offset,
    },
    focus: {
      path: [...selection.focus.path],
      offset: selection.focus.offset,
    },
  };
};

interface EditDocumentItemProps {
  documentItemId: number;
}

const EditDocumentItem = memo((props: EditDocumentItemProps) => {
  const { documentItemId } = props;
  const dynamicExtensions = useDynamicExtensionsStore(
    (state) => state.extensions,
  );
  const titleRef = useRef<EditTextHandle>(null);
  const editorRef = useRef<EditorRef>(null);
  const immersiveEntrySelectionRef = useRef<Range | null>(null);
  const pendingSelectionRef = useRef<Range | null>(null);
  const [readonly, setReadonly] = useState(false);
  const [immersiveMode, setImmersiveMode] = useState(false);
  const [editorRemountKey, setEditorRemountKey] = useState(0);
  const documentItemEventBus = useCreation(
    () => defaultDocumentItemEventBus.createEditor(),
    [],
  );

  const outlineRef = useRef<HTMLDivElement>(null);
  const [editorSourceValueOpen, setEditorSourceValueOpen] = useState(false);

  const extensions = useCreation(() => {
    return [
      ...dynamicExtensions,
      createDocumentCardListExtension(documentItemId),
    ];
  }, [documentItemId, dynamicExtensions]);

  const {
    documentItem,
    saveDocument,
    onInit,
    onContentChange: onContentChangeFromEditDoc,
    onTitleChange,
    setDocumentItem,
  } = useEditDoc(documentItemId);

  const { throttleHandleEditorContentChange } = useEditContent(
    documentItem?.contentId,
    (content) => {
      editorRef.current?.setEditorValue(content);
      onContentChangeFromEditDoc(content);
    },
  );
  const {
    handleSelectionChange: handleEditorSelectionChange,
    handleFocus: handleEditorFocus,
    handleBlur: handleEditorBlur,
  } = useRegisterActiveEditingContext({
    contentId: documentItem?.contentId,
    entityType: "document-item",
    entityId: documentItem?.id,
    editorRef,
    content: documentItem?.content,
  });

  useEffect(() => {
    if (!documentItemId) return;

    const unsubscribe = documentItemEventBus.subscribeToDocumentItemWithId(
      "document-item:updated",
      documentItemId,
      (data) => {
        if (!data.documentItem) return;
        if (data.documentItem.title !== documentItem?.title) {
          titleRef.current?.setValue(data.documentItem.title);
        }
        setDocumentItem(data.documentItem);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [
    documentItemId,
    documentItemEventBus,
    setDocumentItem,
    documentItem?.title,
  ]);

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

  const handleImmersiveExit = useMemoizedFn(
    (payload?: ImmersiveEditorExitPayload) => {
      pendingSelectionRef.current = payload?.selection ?? null;
      setImmersiveMode(false);
      setEditorRemountKey((current) => current + 1);
    },
  );

  useEffect(() => {
    if (immersiveMode || !pendingSelectionRef.current) return;

    const timer = window.setTimeout(() => {
      const editor = editorRef.current?.getEditor();
      const selection = pendingSelectionRef.current;
      if (!editor || !selection) return;

      try {
        Transforms.select(editor, selection);
        ReactEditor.focus(editor as any);
        pendingSelectionRef.current = null;
      } catch (error) {
        console.warn("恢复沉浸模式焦点失败:", error);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [editorRemountKey, immersiveMode]);

  const handleEnterImmersiveMode = useMemoizedFn(() => {
    immersiveEntrySelectionRef.current = cloneRange(
      editorRef.current?.getEditor().selection ?? null,
    );
    setImmersiveMode(true);
  });

  const headers: Array<{
    level: number;
    title: string;
  }> = useMemo(() => {
    if (!documentItem || !documentItem.content) return [];
    const headerNodes = documentItem.content.filter(
      (node) => node.type === "header",
    );
    return headerNodes.map((header) => {
      const headerEl = header as {
        level: number;
        children: Array<{ text?: string }>;
      };
      const title = headerEl.children
        .map((node) =>
          node && typeof node === "object" && "text" in node ? node.text : "",
        )
        .join("");
      return {
        level: headerEl.level,
        title,
      };
    });
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
                key={`${documentItem.id}-${editorRemountKey}`}
                ref={editorRef}
                initValue={documentItem.content}
                onChange={onContentChange}
                onSelectionChange={handleEditorSelectionChange}
                onFocus={handleEditorFocus}
                onBlur={handleEditorBlur}
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
              <span>
                <EditOutlined
                  className={styles.icon}
                  onClick={() => setReadonly(false)}
                />
              </span>
            </Tooltip>
          ) : (
            <Tooltip title={"预览"}>
              <span>
                <ReadOutlined
                  className={styles.icon}
                  onClick={() => setReadonly(true)}
                />
              </span>
            </Tooltip>
          )}
        </div>
        <div className={styles.item}>
          {outlineOpen ? (
            <Tooltip title={"隐藏目录"}>
              <span>
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
              </span>
            </Tooltip>
          ) : (
            <Tooltip title={"显示目录"}>
              <span>
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
              </span>
            </Tooltip>
          )}
        </div>
        <div className={styles.item}>
          <Tooltip title={"源码"}>
            <span>
              <MdOutlineCode
                className={styles.icon}
                onClick={() => setEditorSourceValueOpen(true)}
              />
            </span>
          </Tooltip>
        </div>
        <div className={styles.item}>
          <Tooltip title={"沉浸模式"}>
            <span>
              <Maximize2
                size={14}
                className={styles.icon}
                onClick={handleEnterImmersiveMode}
              />
            </span>
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
          initialSelection={immersiveEntrySelectionRef.current}
          onChange={onContentChange}
          onInit={onInit}
          onExit={handleImmersiveExit}
          wordCount={documentItem.count}
          readonly={readonly}
          extensions={extensions}
        />
      )}
    </div>
  );
});

export default EditDocumentItem;
