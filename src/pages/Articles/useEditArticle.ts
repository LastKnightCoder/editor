import { useEffect, useRef, useState } from 'react';
import { useMemoizedFn } from 'ahooks';
import { Descendant, Editor } from "slate";
import { produce } from "immer";

import useArticleManagementStore from "@/stores/useArticleManagementStore";
import { getEditorTextLength } from "@/utils";
import { IArticle } from "@/types";
import { DEFAULT_ARTICLE_CONTENT } from "@/constants";

const useEditArticle = (articleId: number) => {
  const [initLoading, setInitLoading] = useState(false);
  const [initValue, setInitValue] = useState<Descendant[]>(DEFAULT_ARTICLE_CONTENT);
  const [editingArticle, setEditingArticle] = useState<IArticle | null>(null);
  const [wordsCount, setWordsCount] = useState(0);

  const changed = useRef(false);
  const prevArticle = useRef<IArticle | null>(null);

  const {
    articles,
    updateArticle,
  } = useArticleManagementStore((state) => ({
    articles: state.articles,
    updateArticle: state.updateArticle,
  }));

  useEffect(() => {
    if (!articleId) return;
    setInitLoading(true);
    const article = articles.find((article) => article.id === articleId);
    if (!article) {
      setInitLoading(false);
      return;
    }
    setInitValue(article.content);
    setEditingArticle(article);
    prevArticle.current = article;
    setInitLoading(false);
  }, [articleId, articles]);

  useEffect(() => {
    if (!editingArticle || !prevArticle.current) return;
    changed.current = JSON.stringify(editingArticle) !== JSON.stringify(prevArticle.current);
  }, [editingArticle]);

  const onInit = useMemoizedFn((editor: Editor, content: Descendant[]) => {
    if (!editor) return;
    const wordsCount = getEditorTextLength(editor, content);
    setWordsCount(wordsCount);
  });

  const onContentChange = useMemoizedFn((content: Descendant[], editor: Editor) => {
    if (!editingArticle) return;
    const newEditingArticle = produce(editingArticle, (draft) => {
      draft.content = content;
    });
    setEditingArticle(newEditingArticle);
    if (!editor) return;
    const wordsCount = getEditorTextLength(editor, content);
    setWordsCount(wordsCount);
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
    console.log('onAddTag', newEditingArticle);
    setEditingArticle(newEditingArticle);
  });

  const onDeleteTag = useMemoizedFn((tag: string) => {
    if (!editingArticle) return;
    const newEditingArticle = produce(editingArticle, (draft) => {
      draft.tags = draft.tags.filter(t => t !== tag);
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

  return {
    initValue,
    initLoading,
    editingArticle,
    wordsCount,
    onInit,
    onContentChange,
    onTitleChange,
    onAddTag,
    onDeleteTag,
    saveArticle,
  }
}

export default useEditArticle;