import React, { useEffect, useState, useRef } from "react";
import { Empty } from "antd";
import { useCreation, useMemoizedFn } from "ahooks";
import { LoadingOutlined } from "@ant-design/icons";

import Editor, { EditorRef } from "@editor/index.tsx";
import EditText, { EditTextHandle } from "@/components/EditText";

import {
  fileAttachmentExtension,
  cardLinkExtension,
  projectCardListExtension,
} from "@/editor-extensions";

import { ProjectItem } from "@/types/project";
import {
  getProjectItemById,
  partialUpdateProjectItem,
  updateProjectItemContent,
} from "@/commands";
import { defaultProjectItemEventBus } from "@/utils";
import { Descendant } from "slate";
import { useRightSidebarContext } from "../../../RightSidebarContext";

import styles from "./index.module.less";

interface ProjectItemViewerProps {
  projectItemId: string;
  onTitleChange?: (title: string) => void;
}

const customExtensions = [
  fileAttachmentExtension,
  cardLinkExtension,
  projectCardListExtension,
];

const ProjectItemViewer: React.FC<ProjectItemViewerProps> = ({
  projectItemId,
  onTitleChange,
}) => {
  const [projectItem, setProjectItem] = useState<ProjectItem | null>(null);
  const [loading, setLoading] = useState(true);
  const titleRef = useRef<EditTextHandle>(null);
  const editorRef = useRef<EditorRef>(null);
  const { visible } = useRightSidebarContext();

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
      setProjectItem(fetchedProjectItem);
      if (onTitleChange) {
        onTitleChange(fetchedProjectItem.title);
      }
      console.log(fetchedProjectItem);
    } catch (error) {
      console.error("Error fetching project item:", error);
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    if (visible) {
      fetchProjectItem();
    }
  }, [projectItemId, fetchProjectItem, visible]);

  const handleTitleChange = useMemoizedFn(async (title: string) => {
    if (
      !projectItem ||
      title === projectItem.title ||
      !titleRef.current ||
      !titleRef.current.isFocus()
    )
      return;

    try {
      const updatedProjectItem = await partialUpdateProjectItem({
        id: projectItem.id,
        title,
      });
      setProjectItem(updatedProjectItem);

      if (onTitleChange) {
        onTitleChange(title);
      }
      projectItemEventBus.publishProjectItemEvent(
        "project-item:updated",
        updatedProjectItem,
      );
    } catch (error) {
      console.error("Error updating project item title:", error);
    }
  });

  const handleContentChange = useMemoizedFn(async (content: Descendant[]) => {
    if (!projectItem || !editorRef.current || !editorRef.current.isFocus())
      return;

    try {
      const updatedProjectItem = await updateProjectItemContent(
        Number(projectItem.id),
        content,
      );
      setProjectItem(updatedProjectItem);
      projectItemEventBus.publishProjectItemEvent(
        "project-item:updated",
        updatedProjectItem,
      );
    } catch (error) {
      console.error("Error updating project item content:", error);
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
          onChange={handleContentChange}
          readonly={false}
          extensions={customExtensions}
        />
      </div>
    </div>
  );
};

export default ProjectItemViewer;
