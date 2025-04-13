import React, { useEffect, useState, useRef } from "react";
import { Empty } from "antd";
import {
  useCreation,
  useMemoizedFn,
  useDebounceFn,
  useUnmount,
  useRafInterval,
} from "ahooks";
import { LoadingOutlined } from "@ant-design/icons";

import Editor, { EditorRef } from "@editor/index.tsx";
import EditText, { EditTextHandle } from "@/components/EditText";

import {
  fileAttachmentExtension,
  cardLinkExtension,
  projectCardListExtension,
  questionCardExtension,
} from "@/editor-extensions";

import { ProjectItem } from "@/types/project";
import { getProjectItemById, updateProjectItem } from "@/commands";
import { defaultProjectItemEventBus } from "@/utils";
import { Descendant } from "slate";
import { useRightSidebarContext } from "../../../RightSidebarContext";
import { useWindowFocus } from "@/hooks/useWindowFocus";

import styles from "./index.module.less";

interface ProjectItemViewerProps {
  projectItemId: string;
  onTitleChange?: (title: string) => void;
}

const customExtensions = [
  fileAttachmentExtension,
  cardLinkExtension,
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
  const isWindowFocused = useWindowFocus();

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
        editorRef.current?.setEditorValue(data.projectItem.content);
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

  const { run: handleTitleChange } = useDebounceFn(
    async (title: string) => {
      if (!projectItem) return;
      const changed =
        JSON.stringify(projectItem) !== JSON.stringify(prevProjectItem.current);
      if (!changed) return;

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
    },
    { wait: 200 },
  );

  const handleSaveProjectItem = useMemoizedFn(async () => {
    if (!projectItem) return null;
    const changed =
      JSON.stringify(projectItem) !== JSON.stringify(prevProjectItem.current);
    if (!changed) return null;
    const updatedProjectItem = await updateProjectItem(projectItem);
    prevProjectItem.current = updatedProjectItem;
    setProjectItem(updatedProjectItem);
    return updatedProjectItem;
  });

  const { run: handleContentChange } = useDebounceFn(
    async (content: Descendant[]) => {
      if (!projectItem) return;

      try {
        setProjectItem({
          ...projectItem,
          content,
        });
      } catch (error) {
        console.error("Error updating project item content:", error);
      }
    },
    { wait: 200 },
  );

  useRafInterval(async () => {
    if (
      !projectItem ||
      !isWindowFocused ||
      (!titleRef.current?.isFocus() && !editorRef.current?.isFocus())
    )
      return;
    const changed =
      JSON.stringify(projectItem) !== JSON.stringify(prevProjectItem.current);
    if (!changed) return;
    const updatedProjectItem = await handleSaveProjectItem();
    if (updatedProjectItem) {
      projectItemEventBus.publishProjectItemEvent(
        "project-item:updated",
        updatedProjectItem,
      );
    }
  }, 3000);

  useUnmount(async () => {
    handleTitleChange.flush();
    handleContentChange.flush();
    setTimeout(async () => {
      const updatedProjectItem = await handleSaveProjectItem();
      if (updatedProjectItem) {
        projectItemEventBus.publishProjectItemEvent(
          "project-item:updated",
          updatedProjectItem,
        );
      }
    }, 200);
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
          onChange={handleContentChange}
          readonly={false}
          extensions={customExtensions}
        />
      </div>
    </div>
  );
};

export default ProjectItemViewer;
