import { ProjectItem } from "@/types";
import { useEffect, useRef, useState } from "react";
import { useCreation, useMemoizedFn } from "ahooks";
import {
  getCardById,
  findOneArticle,
  getProjectItemById,
  updateProjectItem,
} from "@/commands";
import { getContentLength } from "@/utils";
import { Descendant, Editor } from "slate";
import { produce } from "immer";
import useProjectsStore from "@/stores/useProjectsStore";
import { useShallow } from "zustand/react/shallow";
import { defaultCardEventBus, defaultArticleEventBus } from "@/utils";

const useEdit = (projectItemId: number) => {
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

  const { dragging } = useProjectsStore(
    useShallow((state) => ({
      dragging: state.dragging,
    })),
  );

  useEffect(() => {
    if (!projectItemId) {
      setProjectItem(null);
      prevProjectItem.current = null;
      return;
    }

    getProjectItemById(projectItemId).then((projectItem) => {
      setProjectItem(projectItem);
      prevProjectItem.current = projectItem;
    });
  }, [projectItemId]);

  const saveProjectItem = useMemoizedFn(async (saveAnyway = false) => {
    if (!projectItem || dragging) return;

    const changed =
      JSON.stringify(projectItem) !== JSON.stringify(prevProjectItem.current);
    if (!changed && !saveAnyway) return;

    const updatedProjectItem = await updateProjectItem(projectItem);

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
