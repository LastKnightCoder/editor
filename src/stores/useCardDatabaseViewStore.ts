import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DataTableView } from "@/types";

interface CardDatabaseViewState {
  views: DataTableView[];
  activeViewId: number | null;
  columnWidths: Record<string, number>; // 保存所有列的宽度
}

interface CardDatabaseViewActions {
  setViews: (views: DataTableView[]) => void;
  setActiveViewId: (viewId: number | null) => void;
  addView: (view: DataTableView) => void;
  updateView: (viewId: number, updates: Partial<DataTableView>) => void;
  deleteView: (viewId: number) => void;
  reorderViews: (orderedIds: number[]) => void;
  setColumnWidth: (columnId: string, width: number) => void;
  initializeDefaultView: () => void;
}

const useCardDatabaseViewStore = create<
  CardDatabaseViewState & CardDatabaseViewActions
>()(
  persist(
    (set, get) => ({
      views: [],
      activeViewId: null,
      columnWidths: {},

      setViews: (views) => set({ views }),

      setActiveViewId: (viewId) => set({ activeViewId: viewId }),

      addView: (view) =>
        set((state) => ({
          views: [...state.views, view],
        })),

      updateView: (viewId, updates) =>
        set((state) => ({
          views: state.views.map((view) =>
            view.id === viewId ? { ...view, ...updates } : view,
          ),
        })),

      deleteView: (viewId) =>
        set((state) => {
          const newViews = state.views.filter((view) => view.id !== viewId);
          const newActiveViewId =
            state.activeViewId === viewId
              ? newViews[0]?.id || null
              : state.activeViewId;
          return {
            views: newViews,
            activeViewId: newActiveViewId,
          };
        }),

      reorderViews: (orderedIds) =>
        set((state) => {
          const orderedViews = orderedIds
            .map((id) => state.views.find((view) => view.id === id))
            .filter((view): view is DataTableView => !!view)
            .map((view, index) => ({ ...view, order: index }));
          return { views: orderedViews };
        }),

      setColumnWidth: (columnId, width) =>
        set((state) => ({
          columnWidths: {
            ...state.columnWidths,
            [columnId]: width,
          },
        })),

      initializeDefaultView: () => {
        const { views } = get();
        if (views.length === 0) {
          // 创建默认表格视图
          const defaultView: DataTableView = {
            id: Date.now(), // 使用时间戳作为临时 ID
            tableId: 0, // 卡片数据库没有真实的 tableId
            name: "所有卡片",
            type: "table",
            order: 0,
            config: {
              columnOrder: [],
              rowOrder: [],
              sorts: [],
              filters: null,
              groupBy: null,
            },
            createTime: Date.now(),
            updateTime: Date.now(),
          };
          set({
            views: [defaultView],
            activeViewId: defaultView.id,
          });
        } else if (get().activeViewId === null) {
          // 如果有视图但没有激活的，激活第一个
          set({ activeViewId: views[0].id });
        }
      },
    }),
    {
      name: "card-database-views",
      partialize: (state) => ({
        views: state.views,
        activeViewId: state.activeViewId,
        columnWidths: state.columnWidths,
      }),
    },
  ),
);

export default useCardDatabaseViewStore;
