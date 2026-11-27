import { ProjectItem } from "@/types";
import { useEffect, useRef, useState } from "react";
import { useCreation, useMemoizedFn } from "ahooks";
import { getCardById, findOneArticle, getProjectItemById, updateProjectItem } from "@/commands";
import { getContentLength } from "@/utils";
import { Descendant, Editor } from "slate";
import { produce } from "immer";
import { useDraggingStore } from "@/stores/useDraggingStore";
import { defaultCardEventBus, defaultArticleEventBus } from "@/utils";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";

const useEdit = (projectItemId: number, onLoadError?: () => void) => {
  const [projectItem, setProjectItem] = useState<ProjectItem | null>(null);
  const [loadError, setLoadError] = useState<unknown>();
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    []
  );
  const prevProjectItem = useRef<ProjectItem | null>(null);
  const cardEventBus = useCreation(() => defaultCardEventBus.createEditor(), []);
  const articleEventBus = useCreation(() => defaultArticleEventBus.createEditor(), []);

  const dragging = useDraggingStore(state => state.dragging);

  // 在数据库连接或切换时加载项目条目
  useDatabaseChangeEffect(() => {
    if (!projectItemId) {
      setProjectItem(null);
      prevProjectItem.current = null;
      return;
    }

    const current = ++request.current;
    setLoadError(undefined);
    void getProjectItemById(projectItemId)
      .then(projectItem => {
        if (request.current !== current) return;
        if (!projectItem) throw new Error("CONTENT_NOT_FOUND");
        setProjectItem(projectItem);
        prevProjectItem.current = projectItem;
      })
      .catch(error => {
        if (request.current !== current) return;
        onLoadError?.();
        setLoadError(error);
      });
  }, [projectItemId]);

  const saveProjectItem = useMemoizedFn(async () => {
    if (!projectItem || dragging) return;

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
    if (!changed) return;

    const updatedProjectItem = await updateProjectItem(projectItem);
    if (!updatedProjectItem) return;

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
    return updatedProjectItem;
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
    const wordsCount = getContentLength(content);
    const newProjectItem = produce(projectItem, draft => {
      draft.content = content;
      draft.count = wordsCount;
    });
    setProjectItem(newProjectItem);
  });

  const onTitleChange = useMemoizedFn((title: string) => {
    if (!projectItem) return;
    if (title === projectItem.title) return;
    const newProjectItem = produce(projectItem, draft => {
      draft.title = title;
    });
    setProjectItem(newProjectItem);
  });

  return {
    projectItem,
    loadError,
    saveProjectItem,
    onInit,
    onContentChange,
    onTitleChange,
    setProjectItem,
    prevProjectItem,
  };
};

export default useEdit;
