/** 微信读书本机偏好：书架排布与排序、笔记页目录开合（分类 / 状态筛选不跨会话保留） */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ShelfLayout, ShelfSort } from "./model";

interface WeReadPrefs {
  layout: ShelfLayout;
  sort: ShelfSort;
  tocOpen: boolean;
  setLayout: (layout: ShelfLayout) => void;
  setSort: (sort: ShelfSort) => void;
  toggleToc: () => void;
}

export const useWeReadPrefs = create<WeReadPrefs>()(
  persist(
    set => ({
      layout: "cover",
      sort: "last",
      tocOpen: true,
      setLayout: layout => set({ layout }),
      setSort: sort => set({ sort }),
      toggleToc: () => set(s => ({ tocOpen: !s.tocOpen })),
    }),
    {
      name: "tau-weread-prefs",
      partialize: ({ layout, sort, tocOpen }) => ({ layout, sort, tocOpen }),
    }
  )
);
