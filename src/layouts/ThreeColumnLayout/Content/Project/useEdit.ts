import { ProjectItem } from "@/types";
import { useEffect, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { getProjectItemById, updateProjectItem, getCardById } from '@/commands';
import { getEditorTextLength } from "@/utils";
import { Descendant, Editor } from "slate";
import { produce } from "immer";
import useProjectsStore from "@/stores/useProjectsStore";
import useCardsManagementStore from "@/stores/useCardsManagementStore";

const useEdit = () => {
  const [projectItem, setProjectItem] = useState<ProjectItem | null>(null);
  const prevProjectItem = useRef<ProjectItem | null>(null);
  const [wordsCount, setWordsCount] = useState(0);
  const contentChanged = useRef(false);

  const {
    activeProjectItemId,
    dragging,
  } = useProjectsStore((state) => ({
    dragging: state.dragging,
    activeProjectItemId: state.activeProjectItemId
  }));

  const {
    updateCard,
  } = useCardsManagementStore((state) => ({
    updateCard: state.updateCard,
  }))

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
  
  useEffect(() => {
    const handleRefreshProjectItem = (e: any) => {
      if (!projectItem) return;
      const updatedProjectItem = e.detail;
      if (updatedProjectItem.id === projectItem.id) {
        getProjectItemById(projectItem.id).then((projectItem) => {
          setProjectItem(projectItem);
        });
      }
    }
    document.addEventListener('refreshProjectItem', handleRefreshProjectItem);
    return () => {
      document.removeEventListener('refreshProjectItem', handleRefreshProjectItem);
    }
  }, [projectItem]);

  const saveProjectItem = useMemoizedFn((saveAnyway = false) => {
    if (!projectItem || !(contentChanged.current || saveAnyway) || dragging) return;
    updateProjectItem(projectItem).then((updatedProject) => {
      setProjectItem(updatedProject);
      prevProjectItem.current = updatedProject;
      contentChanged.current = false;
      if (updatedProject.refType === 'card' && updatedProject.refId) {
        getCardById(updatedProject.refId).then(updateCard);
      }
    });
  });

  const onInit = useMemoizedFn((editor: Editor, content: Descendant[]) => {
    if (!editor) return;
    const wordsCount = getEditorTextLength(editor, content);
    setWordsCount(wordsCount);
  });

  const onContentChange = useMemoizedFn((content: Descendant[], editor: Editor) => {
    if (!projectItem) return;
    const newProjectItem = produce(projectItem, draft => {
      draft.content = content;
    });
    setProjectItem(newProjectItem);
    if (editor) {
      setWordsCount(getEditorTextLength(editor, content));
    }
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
    wordsCount,
    saveProjectItem,
    onInit,
    onContentChange,
    onTitleChange
  }
}

export default useEdit;
