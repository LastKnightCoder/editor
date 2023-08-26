import { create } from "zustand";

import {IArticle} from "@/types";
import {
  getAllArticles,
  createArticle,
  updateArticle,
  deleteArticle,
} from '@/commands';

interface IState {
  articles: IArticle[];
  initLoading: boolean;
}

interface IActions {
  init: () => Promise<void>;
  createArticle: (article: Omit<IArticle, 'id' | 'create_time' | 'update_time'>) => Promise<number>;
  updateArticle: (article: Pick<IArticle, 'id' | 'title' | 'author' | 'tags' | 'links' | 'content'>) => Promise<number>;
  deleteArticle: (id: number) => Promise<number>;
}

const useArticleManagementStore = create<IState & IActions>((set) => ({
  articles: [],
  initLoading: false,
  init: async () => {
    set({ initLoading: true });
    const articles = await getAllArticles();
    set({ articles, initLoading: false });
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
    set({ articles });
    return res;
  }
}));

export default useArticleManagementStore;
