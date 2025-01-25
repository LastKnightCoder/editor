import { useState } from "react";
import { useMemoizedFn } from "ahooks";
import { App } from 'antd';

import useArticleManagementStore from "@/stores/useArticleManagementStore";
import useEditArticle from "@/hooks/useEditArticle";

import { DEFAULT_ARTICLE_CONTENT } from "@/constants";
import { IArticle } from "@/types";

const useArticle = () => {
  const [activeArticleId, setActiveArticleId] = useState<number | undefined>(undefined);
  const { modal } = App.useApp();

  const {
    articles,
    createArticle,
    deleteArticle,
  } = useArticleManagementStore((state) => ({
    articles: state.articles,
    createArticle: state.createArticle,
    deleteArticle: state.deleteArticle,
  }));

  const {
    readonly,
    initValue,
    editingArticle,
    wordsCount,
    onContentChange,
    onInit,
    onDeleteTag,
    onAddTag,
    onTitleChange,
    saveArticle,
    toggleIsTop,
    toggleReadOnly,
    clear,
  } = useEditArticle(activeArticleId);

  const handleAddNewArticle = useMemoizedFn(async () => {
    const article = await createArticle({
      title: '默认文章标题',
      content: DEFAULT_ARTICLE_CONTENT,
      bannerBg: '',
      isTop: false,
      author: '',
      links: [],
      tags: [],
      isDelete: false,
    });
    setActiveArticleId(article.id);
  });

  const handleClickArticle = useMemoizedFn((article: IArticle) => {
    if (article.id === activeArticleId) {
      setActiveArticleId(undefined);
      return;
    }
    setActiveArticleId(article.id);
  })

  const quitEditArticle = useMemoizedFn(() => {
    clear();
    setActiveArticleId(undefined);
  });

  const handleDeleteArticle = useMemoizedFn(async () => {
    if (!activeArticleId) return;
    modal.confirm({
      title: '删除文章',
      content: '确定删除这篇文章吗？',
      onOk: async () => {
        await deleteArticle(activeArticleId);
        setActiveArticleId(undefined);
      },
      okText: '确定',
      cancelText: '取消',
      okButtonProps: {
        danger: true,
      }
    })
  });

  return {
    articles,
    activeArticleId,
    readonly,
    initValue,
    editingArticle,
    wordsCount,
    onContentChange,
    onInit,
    onDeleteTag,
    onAddTag,
    onTitleChange,
    saveArticle,
    toggleIsTop,
    toggleReadOnly,
    handleAddNewArticle,
    handleClickArticle,
    quitEditArticle,
    handleDeleteArticle,
  }
}

export default useArticle;
