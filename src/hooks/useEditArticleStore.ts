import { create } from "zustand";
import { produce } from "immer";
import { Descendant } from "slate";

import { IArticle } from "@/types";
import { DEFAULT_ARTICLE_CONTENT, CREATE_ARTICLE_ID } from "@/constants";
import { findOneArticle, createArticle, updateArticle } from "@/commands";

export type EditingArticle = Omit<IArticle, 'create_time' | 'update_time'> & Partial<IArticle>;

interface IState {
  initLoading: boolean;
  editingArticle: EditingArticle | undefined;
  editingArticleId: number | undefined;
  readonly: boolean;
}

interface IActions {
  initArticle: (articleId: number) => Promise<EditingArticle>;
  onTitleChange: (title: string) => void;
  onContentChange: (content: Descendant[]) => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  createArticle: () => Promise<void>;
  updateArticle: () => Promise<void>;
}

const initialState: IState = {
  initLoading: false,
  editingArticle: undefined,
  editingArticleId: undefined,
  readonly: true,
}

const useEditArticleStore = create<IState & IActions>((set, get) => ({
  ...initialState,
  initArticle: async (articleId) => {
    set({
      initLoading: true,
    })
    if (articleId === CREATE_ARTICLE_ID) {
      const defaultArticle: EditingArticle = {
        id: articleId,
        title: '',
        author: '',
        links: [],
        tags: [],
        content: DEFAULT_ARTICLE_CONTENT
      };
      set({
        editingArticle: defaultArticle,
        initLoading: false,
      });
      return defaultArticle;
    }
    const article = await findOneArticle(articleId);
    if (!article) {
      throw new Error('Article not found');
    }
    set({
      editingArticle: article,
      initLoading: false,
    });
    return article;
  },
  onTitleChange: (title) => {
    const { editingArticle } = get();
    if (!editingArticle) return;
    set({
      editingArticle: produce(editingArticle, draft => {
        draft.title = title;
      })
    });
  },
  onContentChange: (content) => {
    const { editingArticle } = get();
    if (!editingArticle) return;
    set({
      editingArticle: produce(editingArticle, draft => {
        draft.content = content;
      })
    });
  },
  onAddTag: (tag) => {
    const { editingArticle } = get();
    // 判断是否已经存在
    if (!editingArticle || editingArticle.tags.includes(tag) || !tag) {
      return;
    }
    set({
      editingArticle: produce(editingArticle, draft => {
        draft.tags.push(tag);
      })
    });
  },
  onRemoveTag: (tag) => {
    const { editingArticle } = get();
    if (!editingArticle) return;
    set({
      editingArticle: produce(editingArticle, draft => {
        draft.tags = draft.tags.filter(t => t !== tag);
      })
    });
  },
  createArticle: async () => {
    const { editingArticle } = get();
    if (!editingArticle) return;
    const articleId = await createArticle(editingArticle);
    set({
      editingArticleId: articleId,
      editingArticle: produce(editingArticle, draft => {
        draft.id = articleId;
      })
    });
  },
  updateArticle: async () => {
    const { editingArticle } = get();
    if (!editingArticle) return;
    await updateArticle(editingArticle);
  }
}));

export default useEditArticleStore;
