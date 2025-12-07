import { create } from "zustand";

import { IArticle } from "@/types";

interface IState {
  hideArticleList: boolean;
  isArticlePresentation: boolean;
  presentationArticle: IArticle | null;
}

interface IActions {
  startArticlePresentation: (article: IArticle) => void;
  stopArticlePresentation: () => void;
}

const useArticleManagementStore = create<IState & IActions>((set, get) => ({
  hideArticleList: false,
  isArticlePresentation: false,
  presentationArticle: null,
  startArticlePresentation: (article) => {
    set({ isArticlePresentation: true, presentationArticle: article });
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
