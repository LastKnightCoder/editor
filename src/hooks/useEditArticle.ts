import { useEffect, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { Descendant, Editor } from "slate";
import { produce } from "immer";

import useArticleManagementStore from "@/stores/useArticleManagementStore";
import { getContentLength } from "@/utils";
import { IArticle } from "@/types";
import { DEFAULT_ARTICLE_CONTENT } from "@/constants";

const useEditArticle = (articleId?: number) => {
  const [readonly, setReadonly] = useState(false);
  const [initLoading, setInitLoading] = useState(false);
  const [initValue, setInitValue] = useState<Descendant[]>(
    DEFAULT_ARTICLE_CONTENT,
  );
  const [editingArticle, setEditingArticle] = useState<IArticle | undefined>(
    undefined,
  );

  const changed = useRef(false);
  const prevArticle = useRef<IArticle | undefined>(undefined);

  const { articles, updateArticle } = useArticleManagementStore((state) => ({
    articles: state.articles,
    updateArticle: state.updateArticle,
  }));

  useEffect(() => {
    if (!articleId) return;
    setInitLoading(true);
    const article = articles.find((article) => article.id === articleId);
    if (!article) {
      setInitLoading(false);
      setInitValue(DEFAULT_ARTICLE_CONTENT);
      setEditingArticle(undefined);
      prevArticle.current = undefined;
      return;
    }
    setInitValue(article.content);
    setEditingArticle(article);
    prevArticle.current = article;
    setInitLoading(false);

    return () => {
      setInitValue(DEFAULT_ARTICLE_CONTENT);
      setEditingArticle(undefined);
      prevArticle.current = undefined;
    };
  }, [articleId, articles]);

  useEffect(() => {
    if (!editingArticle || !prevArticle.current) return;
    changed.current =
      JSON.stringify(editingArticle) !== JSON.stringify(prevArticle.current);
  }, [editingArticle]);

  const onInit = useMemoizedFn((editor: Editor, content: Descendant[]) => {
    if (!editor || !editingArticle) return;
    const wordsCount = getContentLength(content);
    const newEditingArticle = produce(editingArticle, (draft) => {
      draft.count = wordsCount;
    });
    setEditingArticle(newEditingArticle);
  });

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    if (!editingArticle) return;
    const wordsCount = getContentLength(content);
    const newEditingArticle = produce(editingArticle, (draft) => {
      draft.content = content;
      draft.count = wordsCount;
    });
    setEditingArticle(newEditingArticle);
  });

  const onTitleChange = useMemoizedFn((title: string) => {
    if (!editingArticle) return;
    const newEditingArticle = produce(editingArticle, (draft) => {
      draft.title = title;
    });
    setEditingArticle(newEditingArticle);
  });

  const onAddTag = useMemoizedFn((tag: string) => {
    if (!editingArticle || editingArticle.tags.includes(tag)) return;
    const newEditingArticle = produce(editingArticle, (draft) => {
      draft.tags.push(tag);
    });
    setEditingArticle(newEditingArticle);
  });

  const onDeleteTag = useMemoizedFn((tag: string) => {
    if (!editingArticle) return;
    const newEditingArticle = produce(editingArticle, (draft) => {
      draft.tags = draft.tags.filter((t) => t !== tag);
    });
    setEditingArticle(newEditingArticle);
  });

  const onTagsChange = useMemoizedFn((tags: string[]) => {
    if (!editingArticle) return;
    const newEditingArticle = produce(editingArticle, (draft) => {
      draft.tags = tags;
    });
    setEditingArticle(newEditingArticle);
  });

  const saveArticle = useMemoizedFn(() => {
    if (!editingArticle || !changed.current) return;
    updateArticle(editingArticle).then((newEditingArticle) => {
      prevArticle.current = newEditingArticle;
      changed.current = false;
    });
  });

  const toggleIsTop = useMemoizedFn(() => {
    if (!editingArticle) return;
    const newEditingArticle = produce(editingArticle, (draft) => {
      draft.isTop = !editingArticle.isTop;
    });
    setEditingArticle(newEditingArticle);
  });

  const toggleReadOnly = useMemoizedFn(() => {
    setReadonly((prev) => !prev);
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
