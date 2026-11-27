import { useEffect, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { Descendant, Editor } from "slate";
import { produce } from "immer";

import { getContentLength } from "@/utils";
import { IArticle } from "@/types";
import { DEFAULT_ARTICLE_CONTENT } from "@/constants";
import { findOneArticle, updateArticle } from "@/commands";

const useEditArticle = (articleId?: number, onLoadError?: () => void) => {
  const [readonly, setReadonly] = useState(false);
  const [initLoading, setInitLoading] = useState(false);
  const [loadError, setLoadError] = useState<unknown>();
  const [initValue, setInitValue] = useState<Descendant[]>(DEFAULT_ARTICLE_CONTENT);
  const [editingArticle, setEditingArticle] = useState<IArticle | undefined>(undefined);

  const prevArticle = useRef<IArticle | undefined>(undefined);

  useEffect(() => {
    if (!articleId) return;
    let active = true;
    setInitLoading(true);
    setLoadError(undefined);
    void findOneArticle(articleId)
      .then(article => {
        if (!active) return;
        if (!article) throw new Error("CONTENT_NOT_FOUND");
        setInitValue(article.content);
        setEditingArticle(article);
        prevArticle.current = article;
      })
      .catch(error => {
        if (!active) return;
        onLoadError?.();
        setLoadError(error);
      })
      .finally(() => {
        if (active) setInitLoading(false);
      });
    return () => {
      active = false;
    };
  }, [articleId, onLoadError]);

  const onInit = useMemoizedFn((editor: Editor, content: Descendant[]) => {
    if (!editor || !editingArticle) return;
    const wordsCount = getContentLength(content);
    const newEditingArticle = produce(editingArticle, draft => {
      draft.count = wordsCount;
    });
    setEditingArticle(newEditingArticle);
  });

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    if (!editingArticle) return;
    const wordsCount = getContentLength(content);
    const newEditingArticle = produce(editingArticle, draft => {
      draft.content = content;
      draft.count = wordsCount;
    });
    setEditingArticle(newEditingArticle);
  });

  const onTitleChange = useMemoizedFn((title: string) => {
    if (!editingArticle) return;
    const newEditingArticle = produce(editingArticle, draft => {
      draft.title = title;
    });
    setEditingArticle(newEditingArticle);
  });

  const onAddTag = useMemoizedFn((tag: string) => {
    if (!editingArticle || editingArticle.tags.includes(tag)) return;
    const newEditingArticle = produce(editingArticle, draft => {
      draft.tags.push(tag);
    });
    setEditingArticle(newEditingArticle);
  });

  const onDeleteTag = useMemoizedFn((tag: string) => {
    if (!editingArticle) return;
    const newEditingArticle = produce(editingArticle, draft => {
      draft.tags = draft.tags.filter(t => t !== tag);
    });
    setEditingArticle(newEditingArticle);
  });

  const onTagsChange = useMemoizedFn((tags: string[]) => {
    if (!editingArticle) return;
    const newEditingArticle = produce(editingArticle, draft => {
      draft.tags = tags;
    });
    setEditingArticle(newEditingArticle);
  });

  const saveArticle = useMemoizedFn(async () => {
    if (!editingArticle) return null;
    const changed =
      JSON.stringify({
        ...editingArticle,
        content: undefined,
        count: undefined,
      }) !==
      JSON.stringify({
        ...prevArticle.current,
        content: undefined,
        count: undefined,
      });
    if (!changed) return null;
    const newEditingArticle = await updateArticle(editingArticle);
    prevArticle.current = newEditingArticle;
    return newEditingArticle;
  });

  const toggleIsTop = useMemoizedFn(() => {
    if (!editingArticle) return;
    const newEditingArticle = produce(editingArticle, draft => {
      draft.isTop = !editingArticle.isTop;
    });
    setEditingArticle(newEditingArticle);
  });

  const toggleReadOnly = useMemoizedFn(() => {
    setReadonly(prev => !prev);
  });

  const clear = useMemoizedFn(() => {
    setInitValue(DEFAULT_ARTICLE_CONTENT);
    setEditingArticle(undefined);
    prevArticle.current = undefined;
  });

  return {
    readonly,
    initValue,
    initLoading,
    loadError,
    editingArticle,
    onInit,
    onContentChange,
    onTitleChange,
    onAddTag,
    onDeleteTag,
    onTagsChange,
    saveArticle,
    toggleIsTop,
    toggleReadOnly,
    clear,
    setEditingArticle,
  };
};

export default useEditArticle;
