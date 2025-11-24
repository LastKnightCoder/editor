import { useState, useMemo, useEffect, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import type { TableViewConfig } from "@/components/Database/types";
import type {
  DataTableView,
  CreateDataTableView,
  DataTableViewConfig,
} from "@/types";
import {
  getAllWeReadViews,
  saveWeReadView,
  deleteWeReadView,
  getWeReadActiveViewId,
  saveWeReadActiveViewId,
} from "@/commands/weread";

const createDefaultView = (
  columnIds: string[],
  rowIds: string[],
): DataTableView => {
  const now = Date.now();
  return {
    id: now,
    tableId: 0,
    name: "书架（Gallery）",
    type: "gallery",
    order: 0,
    config: {
      columnOrder: columnIds,
      rowOrder: rowIds,
      filters: null,
      sorts: [],
      groupBy: null,
      galleryConfig: {
        coverType: "image",
        coverImageColumnId: "cover",
      },
    },
    createTime: now,
    updateTime: now,
  };
};

interface UseWeReadViewsOptions {
  columnIds: string[];
  rowIds: string[];
  onWarning?: (message: string) => void;
}

export const useWeReadViews = (options: UseWeReadViewsOptions) => {
  const { columnIds, rowIds, onWarning } = options;

  const defaultView = useMemo(
    () => createDefaultView(columnIds, []),
    [columnIds],
  );

  const [views, setViews] = useState<DataTableView[]>(() => [defaultView]);
  const [activeViewId, setActiveViewId] = useState<number>(
    () => defaultView.id,
  );
  const [isLoaded, setIsLoaded] = useState(false);
  const viewsInitializedRef = useRef(false);

  // 从数据库加载视图配置
  useEffect(() => {
    if (viewsInitializedRef.current) return;
    viewsInitializedRef.current = true;

    const loadViews = async () => {
      try {
        const [savedViews, savedActiveViewId] = await Promise.all([
          getAllWeReadViews(),
          getWeReadActiveViewId(),
        ]);

        if (savedViews.length > 0) {
          setViews(savedViews);
          if (savedActiveViewId !== null) {
            const viewExists = savedViews.some(
              (view) => view.id === savedActiveViewId,
            );
            setActiveViewId(viewExists ? savedActiveViewId : savedViews[0].id);
          } else {
            setActiveViewId(savedViews[0].id);
          }
        }
      } catch (error) {
        console.error("加载视图配置失败", error);
      } finally {
        setIsLoaded(true);
      }
    };

    loadViews();
  }, []);

  // 保存视图到数据库（防抖）
  useEffect(() => {
    if (!isLoaded) return;

    const saveViews = async () => {
      try {
        // 保存所有视图
        await Promise.all(views.map((view) => saveWeReadView(view)));
      } catch (error) {
        console.error("保存视图配置失败", error);
      }
    };

    const timer = setTimeout(saveViews, 500);
    return () => clearTimeout(timer);
  }, [views, isLoaded]);

  // 保存活动视图 ID 到数据库
  useEffect(() => {
    if (!isLoaded) return;

    const saveActiveView = async () => {
      try {
        await saveWeReadActiveViewId(activeViewId);
      } catch (error) {
        console.error("保存活动视图失败", error);
      }
    };

    const timer = setTimeout(saveActiveView, 300);
    return () => clearTimeout(timer);
  }, [activeViewId, isLoaded]);

  const mergeOrder = useMemoizedFn(
    (order: string[] | undefined | null, all: string[]) => {
      const existing = Array.isArray(order)
        ? order.filter((id) => all.includes(id))
        : [];
      all.forEach((id) => {
        if (!existing.includes(id)) {
          existing.push(id);
        }
      });
      return existing;
    },
  );

  const normalizeViewConfig = useMemoizedFn(
    (config?: Partial<DataTableViewConfig> | null): DataTableViewConfig => {
      return {
        columnOrder: mergeOrder(config?.columnOrder, columnIds),
        rowOrder: mergeOrder(config?.rowOrder, rowIds),
        columnWidths: config?.columnWidths,
        filters: config?.filters ?? null,
        sorts: config?.sorts ?? [],
        groupBy: config?.groupBy ?? null,
        galleryConfig: config?.galleryConfig,
        calendarConfig: config?.calendarConfig,
        kanbanConfig: config?.kanbanConfig,
      };
    },
  );

  const convertTableConfigToDataConfig = useMemoizedFn(
    (config: TableViewConfig): DataTableViewConfig => ({
      columnOrder: [...config.columnOrder],
      rowOrder: [...config.rowOrder],
      columnWidths: config.columnWidths
        ? { ...config.columnWidths }
        : undefined,
      filters: (config.filters ?? null) as DataTableViewConfig["filters"],
      sorts: config.sorts as unknown as DataTableViewConfig["sorts"],
      groupBy: config.groupBy as DataTableViewConfig["groupBy"],
      galleryConfig: config.galleryConfig,
      calendarConfig: config.calendarConfig,
      kanbanConfig: config.kanbanConfig,
    }),
  );

  // 标准化视图配置
  useEffect(() => {
    setViews((prev) => {
      let changed = false;
      const next = prev.map((view) => {
        const normalized = normalizeViewConfig(view.config);
        if (JSON.stringify(normalized) !== JSON.stringify(view.config)) {
          changed = true;
          return { ...view, config: normalized };
        }
        return view;
      });
      return changed ? next : prev;
    });
  }, [normalizeViewConfig]);

  // 确保 activeViewId 有效
  useEffect(() => {
    if (!views.some((view) => view.id === activeViewId) && views.length > 0) {
      setActiveViewId(views[0].id);
    }
  }, [views, activeViewId]);

  const activeView = useMemo(
    () => views.find((view) => view.id === activeViewId) ?? views[0],
    [views, activeViewId],
  );

  const activeViewConfig: TableViewConfig = useMemo(() => {
    const baseConfig = activeView
      ? normalizeViewConfig(activeView.config)
      : normalizeViewConfig({
          columnOrder: columnIds,
          rowOrder: rowIds,
          filters: null,
          sorts: [],
          groupBy: null,
        });
    return {
      columnOrder: baseConfig.columnOrder,
      rowOrder: baseConfig.rowOrder,
      columnWidths: baseConfig.columnWidths,
      filters: (baseConfig.filters ?? null) as TableViewConfig["filters"],
      sorts: baseConfig.sorts as TableViewConfig["sorts"],
      groupBy: baseConfig.groupBy as TableViewConfig["groupBy"],
      galleryConfig: baseConfig.galleryConfig,
      calendarConfig: baseConfig.calendarConfig,
      kanbanConfig: baseConfig.kanbanConfig,
    };
  }, [activeView, normalizeViewConfig, columnIds, rowIds]);

  const handleViewConfigChange = useMemoizedFn((config: TableViewConfig) => {
    const nextConfig = convertTableConfigToDataConfig(config);
    setViews((prev) =>
      prev.map((view) =>
        view.id === activeViewId ? { ...view, config: nextConfig } : view,
      ),
    );
  });

  const handleCreateView = useMemoizedFn(
    async (viewData: CreateDataTableView): Promise<DataTableView | null> => {
      const now = Date.now();
      const nextView: DataTableView = {
        id: now,
        tableId: 0,
        name: viewData.name,
        type: viewData.type,
        order:
          Math.max(
            0,
            ...views.map((view) =>
              typeof view.order === "number" ? view.order : 0,
            ),
          ) + 1,
        config: normalizeViewConfig({
          columnOrder: columnIds,
          rowOrder: rowIds,
          filters: null,
          sorts: [],
          groupBy: null,
          galleryConfig:
            viewData.type === "gallery"
              ? {
                  coverType: "image",
                  coverImageColumnId: "cover",
                }
              : undefined,
          calendarConfig:
            viewData.type === "calendar"
              ? {
                  dateColumnId:
                    viewData.config?.calendarConfig?.dateColumnId ?? undefined,
                }
              : undefined,
          kanbanConfig: viewData.config?.kanbanConfig,
        }),
        createTime: now,
        updateTime: now,
      };

      setViews((prev) => [...prev, nextView]);
      setActiveViewId(nextView.id);
      return nextView;
    },
  );

  const handleDeleteView = useMemoizedFn(
    async (viewId: number): Promise<number | null> => {
      if (views.length <= 1) {
        onWarning?.("至少需要保留一个视图");
        return null;
      }
      const remaining = views.filter((view) => view.id !== viewId);
      setViews(remaining);
      if (activeViewId === viewId && remaining.length > 0) {
        setActiveViewId(remaining[0].id);
      }

      // 从数据库删除
      try {
        await deleteWeReadView(viewId);
      } catch (error) {
        console.error("删除视图失败", error);
      }

      return viewId;
    },
  );

  const handleRenameView = useMemoizedFn(
    async (viewId: number, name: string): Promise<DataTableView | null> => {
      setViews((prev) =>
        prev.map((view) => (view.id === viewId ? { ...view, name } : view)),
      );
      const updated = views.find((view) => view.id === viewId);
      return updated ? { ...updated, name } : null;
    },
  );

  const handleUpdateView = useMemoizedFn(
    async (
      viewId: number,
      updates: Partial<DataTableView>,
    ): Promise<DataTableView | null> => {
      const updated = views.find((view) => view.id === viewId);
      if (!updated) return null;
      const nextView: DataTableView = {
        ...updated,
        ...updates,
        config: updates.config
          ? normalizeViewConfig(updates.config)
          : updated.config,
      };
      setViews((prev) =>
        prev.map((view) => (view.id === viewId ? nextView : view)),
      );
      return nextView;
    },
  );

  const handleReorderViews = useMemoizedFn(async (orderedIds: number[]) => {
    setViews((prev) => {
      const orderedViews: DataTableView[] = [];
      orderedIds.forEach((id, index) => {
        const view = prev.find((v) => v.id === id);
        if (view) {
          orderedViews.push({ ...view, order: index });
        }
      });
      prev.forEach((view) => {
        if (!orderedViews.find((v) => v.id === view.id)) {
          orderedViews.push(view);
        }
      });
      return orderedViews;
    });
  });

  return {
    views,
    activeViewId,
    activeView,
    activeViewConfig,
    setActiveViewId,
    handleViewConfigChange,
    handleCreateView,
    handleDeleteView,
    handleRenameView,
    handleUpdateView,
    handleReorderViews,
  };
};
