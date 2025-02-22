import { ProjectItem } from "@/types";
import { useEffect, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { getProjectItemById, partialUpdateProjectItem } from '@/commands';
import { getContentLength } from "@/utils";
import { Descendant, Editor } from "slate";
import { produce } from "immer";
import useProjectsStore from "@/stores/useProjectsStore";
import useCardsManagementStore from "@/stores/useCardsManagementStore";

const useEdit = () => {
  const [projectItem, setProjectItem] = useState<ProjectItem | null>(null);
  const prevProjectItem = useRef<ProjectItem | null>(null);
  const contentChanged = useRef(false);

  const {
    activeProjectItemId,
    dragging,
  } = useProjectsStore((state) => ({
    dragging: state.dragging,
    activeProjectItemId: state.activeProjectItemId
  }));

  useEffect(() => {
    if (!activeProjectItemId) {
      setProjectItem(null);
      prevProjectItem.current = null;
      contentChanged.current = false;
      return;
    }

    getProjectItemById(activeProjectItemId).then((projectItem) => {
      setProjectItem(projectItem);
      prevProjectItem.current = projectItem;
    });

  }, [activeProjectItemId]);

  useEffect(() => {
    if (!projectItem || !prevProjectItem.current) return;
    contentChanged.current = JSON.stringify(projectItem) !== JSON.stringify(prevProjectItem.current);
  }, [projectItem]);

  const saveProjectItem = useMemoizedFn((saveAnyway = false) => {
    if (!projectItem || !(contentChanged.current || saveAnyway) || dragging) return;
    partialUpdateProjectItem({
      id: projectItem.id,
      title: projectItem.title,
      content: projectItem.content,
      count: projectItem.count,
    }).then((updatedProject) => {
      setProjectItem(updatedProject);
      prevProjectItem.current = updatedProject;
      contentChanged.current = false;
      if (updatedProject.refType === 'card' && updatedProject.refId) {
        useCardsManagementStore.getState().init().then();
      }
    });
  });

  const onInit = useMemoizedFn((editor: Editor, content: Descendant[]) => {
    if (!editor || !projectItem) return;
    const wordsCount = getContentLength(content);
    const newProjectItem = produce(projectItem, draft => {
      draft.count = wordsCount;
    });
    setProjectItem(newProjectItem);
  });

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    if (!projectItem) return;
    const wordsCount = getContentLength(content)
    const newProjectItem = produce(projectItem, draft => {
      draft.content = content;
      draft.count = wordsCount;
    });
    setProjectItem(newProjectItem);
  });

  const onTitleChange = useMemoizedFn((title: string) => {
    if (!projectItem) return;
    const newProjectItem = produce(projectItem, draft => {
      draft.title = title;
    });
    setProjectItem(newProjectItem);
    const event = new CustomEvent('projectTitleChange', {
      detail: newProjectItem
    });
    document.dispatchEvent(event);
  });

  return {
    projectItem,
    saveProjectItem,
    onInit,
    onContentChange,
    onTitleChange
  }
}

export default useEdit;
