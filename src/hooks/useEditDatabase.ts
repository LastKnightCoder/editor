import { useEffect, useState } from "react";
import { DataTableView, DataTable, CreateDataTableView } from "@/types";
import { useMemoizedFn } from "ahooks";
import { DatabaseData } from "@/components/Database/types";
import {
  createDataTableView,
  deleteDataTableView,
  getDataTableDetail,
  updateDataTable,
  setActiveDataTableView,
  reorderDataTableViews,
} from "@/commands";
import { TableViewConfig } from "@/components/Database/types";
import { updateDataTableView } from "@/commands";

const useEditDatabase = (tableId?: number) => {
  const [activeViewId, setActiveViewId] = useState<number | null>(null);
  const [views, setViews] = useState<DataTableView[]>([]);
  const [table, setTable] = useState<DataTable | null>(null);

  useEffect(() => {
    if (!tableId) return;
    getDataTableDetail(tableId).then(
      ({ table: dataTable, views: viewList }) => {
        if (!dataTable || !viewList) return;
        setTable(dataTable);
        setViews(viewList);
        setActiveViewId(dataTable.activeViewId ?? viewList[0]?.id ?? null);
      },
    );

    return () => {
      setTable(null);
      setViews([]);
      setActiveViewId(null);
    };
  }, [tableId]);

  const onDataChange = useMemoizedFn(async (data: DatabaseData) => {
    if (!table) return;
    const updated = await updateDataTable({
      id: table.id,
      columns: data.columns,
      rows: data.rows,
      activeViewId: table.activeViewId,
    });
    if (updated) {
      setTable(updated);
    }
  });

  const onViewConfigChange = useMemoizedFn(async (config: TableViewConfig) => {
    if (!table || activeViewId == null) return;
    const currentView = views.find((view) => view.id === activeViewId);
    if (!currentView) return;
    const updated = await updateDataTableView({
      ...currentView,
      config: {
        ...currentView.config,
        columnOrder: config.columnOrder,
        rowOrder: config.rowOrder,
        groupBy: config.groupBy ?? null,
        sorts: config.sorts ?? [],
        filters: config.filters ?? null,
        galleryConfig: config.galleryConfig,
        calendarConfig: config.calendarConfig,
      },
    });
    if (updated) {
      setViews((prev) =>
        prev.map((view) => (view.id === updated.id ? updated : view)),
      );
    }
  });

  const onCreateView = useMemoizedFn(async (view: CreateDataTableView) => {
    const newView = await createDataTableView(view).catch((e) => {
      console.error("创建视图失败:", e);
      return null;
    });
    if (!newView) return null;
    setViews((prev) =>
      [...prev, newView].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    );
    onActiveViewIdChange(newView.id);
    return newView;
  });

  const onDeleteView = useMemoizedFn(async (viewId: number) => {
    if (views.length === 1) return null;
    const result = await deleteDataTableView(viewId).catch((e) => {
      console.error("删除视图失败:", e);
      return null;
    });
    if (!result) return null;
    setViews((prev) => {
      const nextViews = prev.filter((view) => view.id !== viewId);
      if (activeViewId === viewId) {
        onActiveViewIdChange(nextViews[0]?.id ?? null);
      }
      return nextViews;
    });
    return viewId;
  });

  const onActiveViewIdChange = useMemoizedFn(async (viewId: number | null) => {
    if (!tableId) return;

    const result = await setActiveDataTableView(tableId, viewId).catch((e) => {
      console.error("设置活跃视图失败:", e);
      return null;
    });
    if (!result) return;
    setActiveViewId(viewId);
  });

  const onRenameView = useMemoizedFn(async (viewId: number, name: string) => {
    const target = views.find((view) => view.id === viewId);
    if (!target) return null;
    const updated = await updateDataTableView({
      ...target,
      name,
    }).catch((error) => {
      console.error("更新视图名称失败:", error);
      return null;
    });
    if (!updated) return null;
    setViews((prev) =>
      prev
        .map((view) => (view.id === updated.id ? updated : view))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    );
    return updated;
  });

  const onReorderViews = useMemoizedFn(async (orderedIds: number[]) => {
    if (!tableId) return;
    setViews((prev) => {
      const orderMap = new Map<number, number>();
      orderedIds.forEach((id, index) => {
        orderMap.set(id, index);
      });
      return prev
        .map((view) => ({
          ...view,
          order: orderMap.has(view.id) ? orderMap.get(view.id)! : view.order,
        }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    });
    await reorderDataTableViews(tableId, orderedIds).catch((error) => {
      console.error("视图排序失败:", error);
    });
  });

  const onUpdateView = useMemoizedFn(
    async (
      viewId: number,
      updates: {
        name?: string;
        type?: "table" | "gallery" | "calendar";
        galleryConfig?: {
          coverType: "detail" | "image";
          coverImageColumnId?: string;
        };
        calendarConfig?: {
          dateColumnId?: string;
        };
      },
    ) => {
      const target = views.find((view) => view.id === viewId);
      if (!target) return null;

      // 确定最终的类型
      const finalType = updates.type ?? target.type;

      // 根据类型决定 galleryConfig
      const finalConfig = {
        ...target.config,
        galleryConfig:
          finalType === "gallery"
            ? (updates.galleryConfig ?? target.config.galleryConfig)
            : undefined,
        calendarConfig:
          finalType === "calendar"
            ? (updates.calendarConfig ?? target.config.calendarConfig)
            : undefined,
      };

      const updated = await updateDataTableView({
        ...target,
        name: updates.name ?? target.name,
        type: finalType,
        config: finalConfig,
      }).catch((error) => {
        console.error("更新视图失败:", error);
        return null;
      });

      if (!updated) return null;

      setViews((prev) =>
        prev
          .map((view) => (view.id === updated.id ? updated : view))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      );
      return updated;
    },
  );

  return {
    activeViewId,
    views,
    table,
    onDataChange,
    onViewConfigChange,
    onCreateView,
    onDeleteView,
    onRenameView,
    onUpdateView,
    onReorderViews,
    onActiveViewIdChange,
  };
};

export default useEditDatabase;
