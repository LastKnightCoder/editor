import { create } from "zustand";

import {IArticle} from "@/types";
import {
  getAllArticles,
  createArticle,
  updateArticle,
  deleteArticle,
  updateArticleIsTop,
  updateArticleBannerBg,
} from '@/commands';

interface IState {
  articles: IArticle[];
  initLoading: boolean;
}

interface IActions {
  init: () => Promise<void>;
  createArticle: (article: Omit<IArticle, 'id' | 'create_time' | 'update_time'>) => Promise<number>;
  updateArticle: (article: Pick<IArticle, 'id' | 'title' | 'author' | 'tags' | 'links' | 'content' | 'bannerBg' | 'isTop'>) => Promise<number>;
  deleteArticle: (id: number) => Promise<number>;
  updateArticleIsTop: (id: number, isTop: boolean) => Promise<number>;
  updateArticleBannerBg: (id: number, bannerBg: string) => Promise<number>;
}

const processArticles = (articles: IArticle[]) => {
  // 找到所有 is_top 为 true 的文章，将其置顶
  const topArticles = articles.filter((article) => article.isTop);
  const notTopArticles = articles.filter((article) => !article.isTop);
  return [...topArticles, ...notTopArticles];
}

const useArticleManagementStore = create<IState & IActions>((set) => ({
  articles: [],
  initLoading: false,
  init: async () => {
    set({ initLoading: true });
    const articles = await getAllArticles();
    const processedArticles = processArticles(articles);
    set({ articles: processedArticles, initLoading: false });
  },
  createArticle: async (article) => {
    const res = await createArticle(article);
    const articles = await getAllArticles();
    set({ articles });
    return res;
  },
  updateArticle: async (article) => {
    const res = await updateArticle(article);
    const articles = await getAllArticles();
    set({ articles });
    return res;
  },
  deleteArticle: async (id) => {
    const res = await deleteArticle(id);
    const articles = await getAllArticles();
    const processedArticles = processArticles(articles);
    set({ articles: processedArticles });
    return res;
  },
  updateArticleIsTop: async (id, isTop) => {
    const res = await updateArticleIsTop(id, isTop);
    const articles = await getAllArticles();
    const processedArticles = processArticles(articles);
    set({ articles: processedArticles });
    return res;
  },
  updateArticleBannerBg: async (id: number, bannerBg: string) => {
    const res = await updateArticleBannerBg(id, bannerBg);
    const articles = await getAllArticles();
    const processedArticles = processArticles(articles);
    set({ articles: processedArticles });
    return res;
  }
}));

export default useArticleManagementStore;
