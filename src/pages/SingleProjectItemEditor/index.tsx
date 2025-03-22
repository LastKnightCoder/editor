import { useEffect, useRef, useState } from "react";
import { Descendant } from "slate";
import { useSearchParams } from "react-router-dom";

import Editor, { EditorRef } from "@/components/Editor";
import EditText, { EditTextHandle } from "@/components/EditText";
import ErrorBoundary from "@/components/ErrorBoundary";

import useUploadResource from "@/hooks/useUploadResource.ts";
import {
  cardLinkExtension,
  fileAttachmentExtension,
  projectCardListExtension,
} from "@/editor-extensions";
import {
  getProjectItemById,
  partialUpdateProjectItem,
  connectDatabaseByName,
  closeDatabase,
} from "@/commands";
import { formatDate, getContentLength } from "@/utils";
import { useMemoizedFn, useRafInterval, useUnmount } from "ahooks";

import styles from "./index.module.less";
import { EditCardContext } from "@/context";
import { ProjectItem } from "@/types";

const customExtensions = [
  cardLinkExtension,
  fileAttachmentExtension,
  projectCardListExtension,
];
const editotContextValue = {
  cardId: -1,
};

const SingleProjectItemEditor = () => {
  const [searchParams] = useSearchParams();
  const projectItemId = Number(searchParams.get("projectItemId"));
  const databaseName = searchParams.get("databaseName");

  const titleRef = useRef<EditTextHandle>(null);
  const [editingProjectItem, setEditingProjectItem] =
    useState<ProjectItem | null>(null);
  const [content, setContent] = useState<Descendant[]>([]);
  const [title, setTitle] = useState<string>("");

  const editorRef = useRef<EditorRef>(null);
  const uploadResource = useUploadResource();

  useEffect(() => {
    if (!databaseName || !projectItemId) {
      return;
    }

    const loadProjectItem = async (projectItemId: number) => {
      try {
        const projectItem = await getProjectItemById(projectItemId);
        setEditingProjectItem(projectItem);
        setContent(projectItem.content);
        setTitle(projectItem.title);
      } catch (error) {
        console.error("Failed to load project item:", error);
      }
    };

    connectDatabaseByName(databaseName).then(() => {
      loadProjectItem(projectItemId);
    });

    return () => {
      closeDatabase(databaseName);
    };
  }, [databaseName, projectItemId]);

  const onContentChange = useMemoizedFn((value: Descendant[]) => {
    setContent(value);
  });

  const onTitleChange = useMemoizedFn((value: string) => {
    setTitle(value);
  });

  const saveProjectItem = useMemoizedFn(async () => {
    if (!editingProjectItem) return;

    try {
      const wordsCount = getContentLength(content);
      await partialUpdateProjectItem({
        id: editingProjectItem.id,
        title,
        content,
        count: wordsCount,
      });
    } catch (error) {
      console.error("Failed to save project item:", error);
    }
  });

  useRafInterval(() => {
    saveProjectItem();
  }, 2000);

  useUnmount(() => {
    saveProjectItem();
  });

  const onPressEnter = useMemoizedFn(() => {
    editorRef.current?.focus();
  });

  if (!editingProjectItem) {
    return <div className={styles.loading}>Loading project item...</div>;
  }

  return (
    <div className={styles.singleProjectItemEditorContainer}>
      <div className={styles.time}>
        <div>
          <span>创建于 {formatDate(editingProjectItem.createTime, true)}</span>
        </div>
        <div>
          <span>
            最后修改于 {formatDate(editingProjectItem.updateTime, true)}
          </span>
        </div>
      </div>
      <div className={styles.title}>
        <EditText
          ref={titleRef}
          defaultValue={title}
          onChange={onTitleChange}
          onPressEnter={onPressEnter}
          contentEditable={true}
        />
      </div>
      <div className={styles.editor}>
        <EditCardContext.Provider value={editotContextValue}>
          <ErrorBoundary>
            <Editor
              ref={editorRef}
              initValue={content}
              onChange={onContentChange}
              extensions={customExtensions}
              readonly={false}
              uploadResource={uploadResource}
            />
          </ErrorBoundary>
        </EditCardContext.Provider>
      </div>
    </div>
  );
};

export default SingleProjectItemEditor;
