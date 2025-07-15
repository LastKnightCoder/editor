import React, { useEffect, useState, useRef } from "react";
import { Empty } from "antd";
import { useCreation, useMemoizedFn, useUnmount, useRafInterval } from "ahooks";
import { LoadingOutlined } from "@ant-design/icons";

import Editor, { EditorRef } from "@editor/index.tsx";
import EditText, { EditTextHandle } from "@/components/EditText";

import {
  fileAttachmentExtension,
  contentLinkExtension,
  projectCardListExtension,
  questionCardExtension,
} from "@/editor-extensions";

import { ProjectItem } from "@/types/project";
import { getProjectItemById, updateProjectItem } from "@/commands";
import { defaultProjectItemEventBus } from "@/utils";
import useEditContent from "@/hooks/useEditContent";
import useUploadResource from "@/hooks/useUploadResource";
import { Descendant } from "slate";
import { useRightSidebarContext } from "../../../RightSidebarContext";

import styles from "./index.module.less";

interface ProjectItemViewerProps {
  projectItemId: string;
  onTitleChange?: (title: string) => void;
}

const customExtensions = [
  fileAttachmentExtension,
  contentLinkExtension,
  projectCardListExtension,
  questionCardExtension,
];

const ProjectItemViewer: React.FC<ProjectItemViewerProps> = ({
  projectItemId,
  onTitleChange,
}) => {
  const [projectItem, setProjectItem] = useState<ProjectItem | null>(null);
  const [loading, setLoading] = useState(true);
  const titleRef = useRef<EditTextHandle>(null);
  const editorRef = useRef<EditorRef>(null);
  const prevProjectItem = useRef<ProjectItem | null>(null);
  const { visible, isConnected } = useRightSidebarContext();
  const uploadResource = useUploadResource();
  const { throttleHandleEditorContentChange } = useEditContent(
    projectItem?.contentId,
    (content) => {
      editorRef.current?.setEditorValue(content);
    },
  );

  const projectItemEventBus = useCreation(
    () => defaultProjectItemEventBus.createEditor(),
    [],
  );

  useEffect(() => {
    const unsubscribe = projectItemEventBus.subscribeToProjectItemWithId(
      "project-item:updated",
      Number(projectItemId),
      (data) => {
        setProjectItem(data.projectItem);
        prevProjectItem.current = data.projectItem;
        titleRef.current?.setValue(data.projectItem.title);
        if (onTitleChange) {
          onTitleChange(data.projectItem.title);
        }
      },
    );

    return () => {
      unsubscribe();
    };
  }, [projectItemEventBus, projectItemId]);

  const fetchProjectItem = useMemoizedFn(async () => {
    setLoading(true);
    try {
      const fetchedProjectItem = await getProjectItemById(
        Number(projectItemId),
      );
      if (!fetchedProjectItem) return;
      setProjectItem(fetchedProjectItem);
      if (onTitleChange) {
        onTitleChange(fetchedProjectItem.title);
      }
      prevProjectItem.current = fetchedProjectItem;
    } catch (error) {
      console.error("Error fetching project item:", error);
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    if (visible && isConnected) {
      fetchProjectItem();
    }
  }, [projectItemId, fetchProjectItem, visible, isConnected]);

  const handleTitleChange = useMemoizedFn(async (title: string) => {
    if (!projectItem) return;

    try {
      setProjectItem({
        ...projectItem,
        title,
      });

      if (onTitleChange) {
        onTitleChange(title);
      }
    } catch (error) {
      console.error("Error updating project item title:", error);
    }
  });

  const handleSaveProjectItem = useMemoizedFn(async () => {
    if (!projectItem) return null;
    const changed =
      JSON.stringify({
        ...projectItem,
        content: undefined,
        count: undefined,
      }) !==
      JSON.stringify({
        ...prevProjectItem.current,
        content: undefined,
        count: undefined,
      });
    if (!changed) return null;
    const updatedProjectItem = await updateProjectItem(projectItem);
    prevProjectItem.current = updatedProjectItem;
    setProjectItem(updatedProjectItem);
    return updatedProjectItem;
  });

  const handleContentChange = useMemoizedFn(async (content: Descendant[]) => {
    if (!projectItem) return;

    try {
      setProjectItem({
        ...projectItem,
        content,
      });
    } catch (error) {
      console.error("Error updating project item content:", error);
    }
  });

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    throttleHandleEditorContentChange(content);
    handleContentChange(content);
  });

  useRafInterval(async () => {
    if (!projectItem) return;
    const updatedProjectItem = await handleSaveProjectItem();
    if (updatedProjectItem) {
      projectItemEventBus.publishProjectItemEvent(
        "project-item:updated",
        updatedProjectItem,
      );
    }
  }, 500);

  useUnmount(async () => {
    throttleHandleEditorContentChange.flush();
    const updatedProjectItem = await handleSaveProjectItem();
    if (updatedProjectItem) {
      projectItemEventBus.publishProjectItemEvent(
        "project-item:updated",
        updatedProjectItem,
      );
    }
  });

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <LoadingOutlined />
      </div>
    );
  }

  if (!projectItem) {
    return (
      <div className={styles.errorContainer}>
        <Empty description="项目不存在或已被删除" />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.titleContainer}>
        <EditText
          ref={titleRef}
          defaultValue={projectItem.title}
          className={styles.title}
          contentEditable={true}
          onChange={handleTitleChange}
        />
      </div>
      <div className={styles.contentContainer}>
        <Editor
          ref={editorRef}
          initValue={projectItem.content}
          onChange={onContentChange}
          readonly={false}
          uploadResource={uploadResource}
          extensions={customExtensions}
        />
      </div>
    </div>
  );
};

export default ProjectItemViewer;
