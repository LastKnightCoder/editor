import { useEffect, useRef } from "react";
import useUploadResource from "@/hooks/useUploadResource.ts";
import { useCreation, useMemoizedFn, useRafInterval } from "ahooks";
import useEdit from "./useEdit";
import { useShallow } from "zustand/react/shallow";
import useProjectsStore from "@/stores/useProjectsStore";

import { formatDate, defaultProjectItemEventBus } from "@/utils";
import Editor, { EditorRef } from "@/components/Editor";
import EditText, { EditTextHandle } from "@/components/EditText";
import EditorOutline from "@/components/EditorOutline";
import { EditCardContext } from "@/context.ts";
import {
  cardLinkExtension,
  fileAttachmentExtension,
  projectCardListExtension,
} from "@/editor-extensions";
import { getProjectItemById, updateProjectItem } from "@/commands";
import { on, off } from "@/electron";

import styles from "./index.module.less";
import { Descendant } from "slate";

const extensions = [
  cardLinkExtension,
  fileAttachmentExtension,
  projectCardListExtension,
];

const Project = () => {
  const editorRef = useRef<EditorRef>(null);
  const titleRef = useRef<EditTextHandle>(null);
  const projectItemEventBus = useCreation(
    () => defaultProjectItemEventBus.createEditor(),
    [],
  );

  const {
    projectItem,
    onInit,
    onTitleChange,
    onContentChange,
    saveProjectItem,
    setProjectItem,
  } = useEdit();

  const { showOutline, readonly } = useProjectsStore(
    useShallow((state) => ({
      showOutline: state.showOutline,
      readonly: state.readonly,
    })),
  );

  useRafInterval(() => {
    if (readonly) return;
    saveProjectItem();
  }, 3000);

  useEffect(() => {
    return () => {
      if (readonly) return;
      saveProjectItem();
    };
  }, [readonly, saveProjectItem]);

  const uploadResource = useUploadResource();

  const onClickHeader = useMemoizedFn((index: number) => {
    editorRef.current?.scrollHeaderIntoView(index);
  });

  const onPressEnter = useMemoizedFn(() => {
    editorRef.current?.focus();
  });

  useEffect(() => {
    if (!projectItem) return;

    const handleProjectItemWindowClosed = async (
      _e: any,
      data: { projectItemId: number; databaseName: string },
    ) => {
      if (data.projectItemId === projectItem.id) {
        const updatedProjectItem = await getProjectItemById(data.projectItemId);

        editorRef.current?.setEditorValue(updatedProjectItem.content);
        titleRef.current?.setValue(updatedProjectItem.title);

        onTitleChange(updatedProjectItem.title);
        onContentChange(updatedProjectItem.content);
      }
    };

    on("project-item-window-closed", handleProjectItemWindowClosed);

    return () => {
      off("project-item-window-closed", handleProjectItemWindowClosed);
    };
  }, [projectItem?.id, onTitleChange, onContentChange]);

  useEffect(() => {
    if (!projectItem) return;

    const unsubscribe = projectItemEventBus.subscribeToProjectItemWithId(
      "project-item:updated",
      projectItem.id,
      (data) => {
        setProjectItem(data.projectItem);
        editorRef.current?.setEditorValue(data.projectItem.content);
        titleRef.current?.setValue(data.projectItem.title);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [projectItem?.id]);

  const handleOnTitleChange = useMemoizedFn((title: string) => {
    if (!projectItem || !titleRef.current || !titleRef.current.isFocus())
      return;
    onTitleChange(title);
    projectItemEventBus.publishProjectItemEvent("project-item:updated", {
      ...projectItem,
      title,
    });
  });

  const handleOnContentChange = useMemoizedFn((content: Descendant[]) => {
    if (!projectItem || !editorRef.current || !editorRef.current.isFocus())
      return;
    onContentChange(content);
    projectItemEventBus.publishProjectItemEvent("project-item:updated", {
      ...projectItem,
      content,
    });
  });

  if (!projectItem) return null;
  return (
    <div className={styles.editProjectContainer}>
      <div className={styles.editProject}>
        <div className={styles.editorContainer}>
          <div className={styles.title}>
            <EditText
              key={projectItem.id}
              ref={titleRef}
              defaultValue={projectItem.title}
              onChange={handleOnTitleChange}
              contentEditable={!readonly}
              onPressEnter={onPressEnter}
            />
          </div>
          <div className={styles.time}>
            <div>创建于 {formatDate(projectItem.createTime, true)}</div>
            <div>最后修改于 {formatDate(projectItem.updateTime, true)}</div>
          </div>
          <EditCardContext.Provider
            value={{
              cardId: -1,
            }}
          >
            <Editor
              key={projectItem.id}
              ref={editorRef}
              initValue={projectItem.content}
              onInit={onInit}
              onChange={handleOnContentChange}
              uploadResource={uploadResource}
              readonly={readonly}
              extensions={extensions}
            />
          </EditCardContext.Provider>
        </div>
        <EditorOutline
          className={styles.outline}
          content={projectItem.content}
          show={showOutline}
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
          <div>字数：{projectItem.count}</div>
        </div>
      </div>
    </div>
  );
};

export default Project;
