import { useRef, useState, useEffect, useMemo, memo } from "react";
import { motion } from "framer-motion";
import { Tooltip } from "antd";
import { useRafInterval } from "ahooks";
import classnames from "classnames";

import Editor, { EditorRef } from "@/components/Editor";
import EditorSourceValue from "@/components/EditorSourceValue";

import useUploadResource from "@/hooks/useUploadResource.ts";
import useEditDoc from "./useEditDoc";

import { EditOutlined, ReadOutlined } from "@ant-design/icons";
import {
  MdFormatIndentIncrease,
  MdFormatIndentDecrease,
  MdOutlineCode,
} from "react-icons/md";

import { formatDate } from "@/utils/time.ts";
import {
  cardLinkExtension,
  documentCardListExtension,
  fileAttachmentExtension,
} from "@/editor-extensions";

import styles from "./index.module.less";
import EditorOutline from "@/components/EditorOutline";
import { EditCardContext } from "@/context.ts";

const extensions = [
  cardLinkExtension,
  documentCardListExtension,
  fileAttachmentExtension,
];

const EditDoc = memo(() => {
  const [editingTitle, setEditingTitle] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<EditorRef>(null);
  const [readonly, setReadonly] = useState(false);

  const outlineRef = useRef<HTMLDivElement>(null);
  const [editorSourceValueOpen, setEditorSourceValueOpen] = useState(false);

  const {
    activeDocumentItem,
    saveDocument,
    onInit,
    onContentChange,
    onTitleChange,
    initValue,
  } = useEditDoc();

  const uploadResource = useUploadResource();

  useRafInterval(() => {
    saveDocument();
  }, 3000);

  useEffect(() => {
    return () => {
      onContentChange.flush();
      saveDocument();
    };
  }, [saveDocument, onContentChange]);

  useEffect(() => {
    // 禁止在标题中输入回车
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && editingTitle) {
        e.preventDefault();
        e.stopPropagation();
        titleRef.current?.blur();
        editorRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [editingTitle]);

  const headers: Array<{
    level: number;
    title: string;
  }> = useMemo(() => {
    if (!activeDocumentItem || !activeDocumentItem.content) return [];
    const headers = activeDocumentItem.content.filter(
      (node) => node.type === "header",
    );
    return headers.map((header: any) => ({
      level: header.level,
      title: header.children
        .map((node: { text: string }) => node.text)
        .join(""),
    }));
  }, [activeDocumentItem]);

  const [outlineOpen, setOutlineOpen] = useState(() => {
    if (!activeDocumentItem) return false;
    return headers.length > 0;
  });

  const onClickHeader = (index: number) => {
    if (!editorRef.current) return;
    editorRef.current.scrollHeaderIntoView(index);
  };

  if (!activeDocumentItem) {
    return null;
  }

  return (
    <motion.div layout className={styles.editDocContainer}>
      <div className={styles.editDoc}>
        <div className={styles.editorContainer}>
          <div
            className={styles.title}
            ref={titleRef}
            // @ts-ignore
            contentEditable={!readonly ? "plaintext-only" : false}
            suppressContentEditableWarning
            onFocus={() => setEditingTitle(true)}
            onBlur={(e) => {
              onTitleChange(e.target.innerText);
              setEditingTitle(false);
            }}
          >
            {activeDocumentItem.title}
          </div>
          <div className={styles.time}>
            <div>创建于 {formatDate(activeDocumentItem.createTime, true)}</div>
            <div>
              最后修改于 {formatDate(activeDocumentItem.updateTime, true)}
            </div>
          </div>
          <EditCardContext.Provider
            value={{
              cardId: -1,
            }}
          >
            <Editor
              key={activeDocumentItem.id}
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
          content={activeDocumentItem.content}
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
          <div>字数：{activeDocumentItem.count}</div>
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
        content={activeDocumentItem.content}
      />
    </motion.div>
  );
});

export default EditDoc;
