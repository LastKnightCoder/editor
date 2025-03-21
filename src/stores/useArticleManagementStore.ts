import { create } from "zustand";
import { produce } from "immer";

import { IArticle, ICreateArticle } from "@/types";
import {
  getAllArticles,
  createArticle,
  updateArticle,
  deleteArticle,
  updateArticleIsTop,
  updateArticleBannerBg,
} from "@/commands";

interface IState {
  articles: IArticle[];
  initLoading: boolean;
  activeArticleId: number | undefined;
  hideArticleList: boolean;
  isArticlePresentation: boolean;
  presentationArticle: IArticle | null;
}

interface IActions {
  init: () => Promise<void>;
  createArticle: (article: ICreateArticle) => Promise<IArticle>;
  updateArticle: (
    article: Omit<IArticle, "create_time" | "update_time" | "isDelete">,
  ) => Promise<IArticle>;
  deleteArticle: (id: number) => Promise<number>;
  updateArticleIsTop: (id: number, isTop: boolean) => Promise<number>;
  updateArticleBannerBg: (id: number, bannerBg: string) => Promise<number>;
  startArticlePresentation: (id: number) => void;
  stopArticlePresentation: () => void;
}

const processArticles = (articles: IArticle[]) => {
  // 找到所有 is_top 为 true 的文章，将其置顶
  const topArticles = articles.filter((article) => article.isTop);
  const notTopArticles = articles.filter((article) => !article.isTop);
  return [...topArticles, ...notTopArticles];
};

const useArticleManagementStore = create<IState & IActions>((set, get) => ({
  articles: [],
  initLoading: false,
  activeArticleId: undefined,
  hideArticleList: false,
  isArticlePresentation: false,
  presentationArticle: null,
  init: async () => {
    set({ initLoading: true });
    const articles = await getAllArticles();
    const processedArticles = processArticles(articles);
    set({ articles: processedArticles, initLoading: false });
  },
  createArticle: async (article) => {
    const { articles } = get();
    const createdArticle = await createArticle(article);
    const newArticles = produce(articles, (draft) => {
      draft.unshift(createdArticle);
    });
    const processedArticles = processArticles(newArticles);
    set({ articles: processedArticles });
    return createdArticle;
  },
  updateArticle: async (article) => {
    const { articles } = get();
    const updatedArticle = await updateArticle(article);
    const newArticles = produce(articles, (draft) => {
      const index = draft.findIndex((a) => a.id === updatedArticle.id);
      if (index !== -1) {
        draft[index] = updatedArticle;
      }
    });
    const processedArticles = processArticles(newArticles);
    set({ articles: processedArticles });
    return updatedArticle;
  },
  deleteArticle: async (id) => {
    const { articles } = get();
    const res = await deleteArticle(id);
    const newArticles = produce(articles, (draft) => {
      const index = draft.findIndex((a) => a.id === id);
      if (index !== -1) {
        draft.splice(index, 1);
      }
    });
    const processedArticles = processArticles(newArticles);
    set({ articles: processedArticles });
    return res;
  },
  updateArticleIsTop: async (id, isTop) => {
    const { articles } = get();
    const updatedArticle = await updateArticleIsTop(id, isTop);
    const newArticles = produce(articles, (draft) => {
      const index = draft.findIndex((a) => a.id === id);
      if (index !== -1) {
        draft[index].isTop = isTop;
      }
    });
    const processedArticles = processArticles(newArticles);
    set({ articles: processedArticles });
    return updatedArticle;
  },
  updateArticleBannerBg: async (id: number, bannerBg: string) => {
    const { articles } = get();
    const updatedArticle = await updateArticleBannerBg(id, bannerBg);
    const newArticles = produce(articles, (draft) => {
      const index = draft.findIndex((a) => a.id === id);
      if (index !== -1) {
        draft[index].bannerBg = bannerBg;
      }
    });
    const processedArticles = processArticles(newArticles);
    set({ articles: processedArticles });
    return updatedArticle;
  },
  startArticlePresentation: (id) => {
    const { articles } = get();
    const article = articles.find((a) => a.id === id);
    if (article) {
      set({ isArticlePresentation: true, presentationArticle: article });
    }
  },
  stopArticlePresentation() {
    const { isArticlePresentation } = get();
    if (isArticlePresentation) {
      set({
        isArticlePresentation: false,
        presentationArticle: null,
      });
    }
  },
}));

export default useArticleManagementStore;
