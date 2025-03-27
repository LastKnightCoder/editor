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
import { defaultProjectItemEventBus } from "@/utils/event-bus";
import { formatDate, getContentLength } from "@/utils";
import { useCreation, useMemoizedFn, useRafInterval, useUnmount } from "ahooks";

import styles from "./index.module.less";
import { EditCardContext } from "@/context";
import { ProjectItem } from "@/types";
import { useWindowFocus } from "@/hooks/useWindowFocus";

const customExtensions = [
  cardLinkExtension,
  fileAttachmentExtension,
  projectCardListExtension,
];
const editotContextValue = {
  cardId: -1,
};

const SingleProjectItemEditor = () => {
  const projectItemEventBus = useCreation(
    () => defaultProjectItemEventBus.createEditor(),
    [],
  );
  const [searchParams] = useSearchParams();
  const projectItemId = Number(searchParams.get("projectItemId"));
  const databaseName = searchParams.get("databaseName");

  const isWindowFocused = useWindowFocus();
  const titleRef = useRef<EditTextHandle>(null);
  const [editingProjectItem, setEditingProjectItem] =
    useState<ProjectItem | null>(null);

  const editorRef = useRef<EditorRef>(null);
  const uploadResource = useUploadResource();
  const prevProjectItemRef = useRef<ProjectItem | null>(null);

  useEffect(() => {
    const unsubscribe = projectItemEventBus.subscribeToProjectItemWithId(
      "project-item:updated",
      projectItemId,
      (data) => {
        setEditingProjectItem(data.projectItem);
        editorRef.current?.setEditorValue(data.projectItem.content);
        titleRef.current?.setValue(data.projectItem.title);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [projectItemId, projectItemEventBus]);

  useEffect(() => {
    if (!databaseName || !projectItemId) {
      return;
    }

    const loadProjectItem = async (projectItemId: number) => {
      try {
        const projectItem = await getProjectItemById(projectItemId);
        setEditingProjectItem(projectItem);
        prevProjectItemRef.current = projectItem;
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
    if (
      !editingProjectItem ||
      !editorRef.current?.isFocus() ||
      !isWindowFocused
    )
      return;
    const newProjectItem = {
      ...editingProjectItem,
      content: value,
    };
    setEditingProjectItem(newProjectItem);
  });

  const onTitleChange = useMemoizedFn((value: string) => {
    if (!editingProjectItem || !titleRef.current?.isFocus() || !isWindowFocused)
      return;
    const newProjectItem = {
      ...editingProjectItem,
      title: value,
    };
    setEditingProjectItem(newProjectItem);
  });

  const saveProjectItem = useMemoizedFn(async (forceSave = false) => {
    if (!editingProjectItem) return;

    const changed =
      JSON.stringify(editingProjectItem) !==
      JSON.stringify(prevProjectItemRef.current);
    if (
      ((!editorRef.current?.isFocus() && !titleRef.current?.isFocus()) ||
        !isWindowFocused ||
        !changed) &&
      !forceSave
    )
      return;

    try {
      const wordsCount = getContentLength(editingProjectItem.content);
      const updatedProjectItem = await partialUpdateProjectItem({
        id: editingProjectItem.id,
        title: editingProjectItem.title,
        content: editingProjectItem.content,
        count: wordsCount,
      });

      setEditingProjectItem(updatedProjectItem);
      prevProjectItemRef.current = updatedProjectItem;
    } catch (error) {
      console.error("Failed to save project item:", error);
    }
  });

  useRafInterval(() => {
    saveProjectItem();
  }, 3000);

  useUnmount(() => {
    saveProjectItem(true);
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
          defaultValue={editingProjectItem.title}
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
              initValue={editingProjectItem.content}
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
