/** 文章页本机偏好：网格 / 列表排布与列表排序（网格固定按更新时间分月，不吃排序） */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ArticlePageSort } from "@/types";
import type { ListLayout } from "@/features/shared/list/ListControls";

interface ArticlesPreferences {
  layout: ListLayout;
  listSort: ArticlePageSort;
}

interface ArticlesPreferencesState extends ArticlesPreferences {
  update(patch: Partial<ArticlesPreferences>): void;
}

export const useArticlesPreferencesStore = create<ArticlesPreferencesState>()(
  persist(
    set => ({
      layout: "grid",
      listSort: "updated",
      update: patch => set(patch),
    }),
    {
      name: "tau-articles-preferences",
      partialize: ({ layout, listSort }) => ({ layout, listSort }),
    }
  )
);
