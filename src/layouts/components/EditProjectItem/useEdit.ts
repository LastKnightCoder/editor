import { ProjectItem } from "@/types";
import { useEffect, useRef, useState } from "react";
import { useCreation, useMemoizedFn } from "ahooks";
import {
  getCardById,
  findOneArticle,
  getProjectItemById,
  partialUpdateProjectItem,
} from "@/commands";
import { getContentLength } from "@/utils";
import { Descendant, Editor } from "slate";
import { produce } from "immer";
import useProjectsStore from "@/stores/useProjectsStore";
import { useShallow } from "zustand/react/shallow";
import { defaultCardEventBus, defaultArticleEventBus } from "@/utils";

const useEdit = () => {
  const [projectItem, setProjectItem] = useState<ProjectItem | null>(null);
  const prevProjectItem = useRef<ProjectItem | null>(null);
  const cardEventBus = useCreation(
    () => defaultCardEventBus.createEditor(),
    [],
  );
  const articleEventBus = useCreation(
    () => defaultArticleEventBus.createEditor(),
    [],
  );

  const { activeProjectItemId, dragging } = useProjectsStore(
    useShallow((state) => ({
      dragging: state.dragging,
      activeProjectItemId: state.activeProjectItemId,
    })),
  );

  useEffect(() => {
    if (!activeProjectItemId) {
      setProjectItem(null);
      prevProjectItem.current = null;
      return;
    }

    getProjectItemById(activeProjectItemId).then((projectItem) => {
      setProjectItem(projectItem);
      prevProjectItem.current = projectItem;
    });
  }, [activeProjectItemId]);

  const saveProjectItem = useMemoizedFn(async (saveAnyway = false) => {
    if (!projectItem || dragging) return;

    const changed =
      JSON.stringify(projectItem) !== JSON.stringify(prevProjectItem.current);
    if (!changed && !saveAnyway) return;

    const updatedProjectItem = await partialUpdateProjectItem({
      id: projectItem.id,
      title: projectItem.title,
      content: projectItem.content,
      count: projectItem.count,
    });

    setProjectItem(updatedProjectItem);
    prevProjectItem.current = updatedProjectItem;
    if (updatedProjectItem.refType === "card" && updatedProjectItem.refId) {
      const card = await getCardById(updatedProjectItem.refId);
      cardEventBus.publishCardEvent("card:updated", card);
    }
    if (updatedProjectItem.refType === "article" && updatedProjectItem.refId) {
      const article = await findOneArticle(updatedProjectItem.refId);
      articleEventBus.publishArticleEvent("article:updated", article);
    }
  });

  const onInit = useMemoizedFn((editor: Editor, content: Descendant[]) => {
    if (!editor || !projectItem) return;
    const wordsCount = getContentLength(content);
    const newProjectItem = produce(projectItem, (draft) => {
      draft.count = wordsCount;
    });
    setProjectItem(newProjectItem);
  });

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    if (!projectItem) return;
    const wordsCount = getContentLength(content);
    const newProjectItem = produce(projectItem, (draft) => {
      draft.content = content;
      draft.count = wordsCount;
    });
    setProjectItem(newProjectItem);
  });

  const onTitleChange = useMemoizedFn((title: string) => {
    if (!projectItem) return;
    const newProjectItem = produce(projectItem, (draft) => {
      draft.title = title;
    });
    setProjectItem(newProjectItem);
    const event = new CustomEvent("projectTitleChange", {
      detail: newProjectItem,
    });
    document.dispatchEvent(event);
  });

  return {
    projectItem,
    saveProjectItem,
    onInit,
    onContentChange,
    onTitleChange,
    setProjectItem,
  };
};

export default useEdit;
