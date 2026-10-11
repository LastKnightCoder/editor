import { createContext, useContext, useEffect, useState } from "react";
import type {
  DataTable,
  DataTableView,
  CreateDataTableView,
  DatabaseData,
  TableViewConfig,
  DatabaseHookResult,
  DatabaseDataChange,
  DatabaseRowChanges,
  ColumnDef,
} from "../types/database";

// Export only hook-specific types
export type UseEditDatabaseResult = DatabaseHookResult;

// Dependency injection interface
export interface UseEditDatabaseDeps {
  updateDataTableChanges?: (input: {
    id: number;
    rows: DatabaseRowChanges;
    columns?: ColumnDef[];
  }) => Promise<DataTable | null>;
  getDataTableDetail: (
    tableId: number
  ) => Promise<{ table: DataTable | null; views: DataTableView[] }>;
  updateDataTable: (
    data: DatabaseData & {
      id: number;
      activeViewId: number | null;
    }
  ) => Promise<DataTable | null>;
  updateDataTableView: (view: DataTableView) => Promise<DataTableView | null>;
  createDataTableView: (view: CreateDataTableView) => Promise<DataTableView | null>;
  deleteDataTableView: (viewId: number) => Promise<number>;
  setActiveDataTableView: (tableId: number, viewId: number | null) => Promise<boolean>;
  reorderDataTableViews: (tableId: number, orderedIds: number[]) => Promise<void>;
}

// Base hook with explicit dependencies
export function useEditDatabase(
  tableId: number | undefined,
  deps?: UseEditDatabaseDeps
): DatabaseHookResult | null {
  const [activeViewId, setActiveViewId] = useState<number | null>(null);
  const [views, setViews] = useState<DataTableView[]>([]);
  const [table, setTable] = useState<DataTable | null>(null);

  useEffect(() => {
    if (!deps) {
      console.warn("useEditDatabase: deps not provided");
      return;
    }

    if (!tableId) return;

    deps.getDataTableDetail(tableId).then(({ table: dataTable, views: viewList }) => {
      if (!dataTable || !viewList) return;
      setTable(dataTable);
      setViews(viewList);
      setActiveViewId(dataTable.activeViewId ?? viewList[0]?.id ?? null);
    });

    return () => {
      setTable(null);
      setViews([]);
      setActiveViewId(null);
    };
  }, [tableId, deps]);

  if (!deps) {
    return null;
  }

  const onDataChange = async (data: DatabaseData, change?: DatabaseDataChange) => {
    if (!table) return;
    const updated =
      change && deps.updateDataTableChanges
        ? await deps.updateDataTableChanges({
            id: table.id,
            rows: change.rows,
            ...(change.columnsChanged ? { columns: data.columns } : {}),
          })
        : await deps.updateDataTable({
            id: table.id,
            columns: data.columns,
            rows: data.rows,
            activeViewId: table.activeViewId,
          });
    if (updated) {
      setTable(updated);
    }
  };

  const onViewConfigChange = async (config: TableViewConfig) => {
    if (!table || activeViewId == null) return;
    const currentView = views.find(view => view.id === activeViewId);
    if (!currentView) return;
    const updated = await deps.updateDataTableView({
      ...currentView,
      config: {
        ...currentView.config,
        ...config,
      },
    });
    if (updated) {
      setViews(prev => prev.map(view => (view.id === updated.id ? updated : view)));
    }
  };

  const onCreateView = async (view: CreateDataTableView) => {
    const newView = await deps.createDataTableView(view).catch(e => {
      console.error("创建视图失败:", e);
      return null;
    });
    if (!newView) return null;
    setViews(prev => [...prev, newView].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    onActiveViewIdChange(newView.id);
    return newView;
  };

  const onDeleteView = async (viewId: number) => {
    if (views.length === 1) return null;
    const result = await deps.deleteDataTableView(viewId).catch(e => {
      console.error("删除视图失败:", e);
      return null;
    });
    if (!result) return null;
    setViews(prev => {
      const nextViews = prev.filter(view => view.id !== viewId);
      if (activeViewId === viewId) {
        onActiveViewIdChange(nextViews[0]?.id ?? null);
      }
      return nextViews;
    });
    return viewId;
  };

  const onActiveViewIdChange = async (viewId: number | null) => {
    if (!tableId) return;

    const result = await deps.setActiveDataTableView(tableId, viewId).catch(e => {
      console.error("设置活跃视图失败:", e);
      return null;
    });
    if (!result) return;

    setActiveViewId(viewId);
  };

  const onRenameView = async (viewId: number, name: string) => {
    const target = views.find(view => view.id === viewId);
    if (!target) return null;
    const updated = await deps
      .updateDataTableView({
        ...target,
        name,
      })
      .catch(error => {
        console.error("更新视图名称失败:", error);
        return null;
      });
    if (!updated) return null;
    setViews(prev =>
      prev
        .map(view => (view.id === updated.id ? updated : view))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    );
    return updated;
  };

  const onReorderViews = async (orderedIds: number[]) => {
    if (!tableId) return;
    setViews(prev => {
      const orderMap = new Map<number, number>();
      orderedIds.forEach((id, index) => {
        orderMap.set(id, index);
      });
      return prev
        .map(view => ({
          ...view,
          order: orderMap.has(view.id) ? orderMap.get(view.id)! : view.order,
        }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    });
    await deps.reorderDataTableViews(tableId, orderedIds).catch(error => {
      console.error("视图排序失败:", error);
    });
  };

  const onUpdateView = async (
    viewId: number,
    updates: Parameters<NonNullable<DatabaseHookResult["onUpdateView"]>>[1]
  ) => {
    const target = views.find(view => view.id === viewId);
    if (!target) return null;

    // 确定最终的类型
    const finalType = updates.type ?? target.type;

    // 切换视图类型后只保留新类型的 viewOptions 子键（等价旧「非当前类型 config 置 undefined」）
    const finalViewOptions = updates.viewOptions ?? target.config.viewOptions?.[finalType];
    const finalConfig = {
      ...target.config,
      viewOptions: finalViewOptions !== undefined ? { [finalType]: finalViewOptions } : undefined,
    };

    const updated = await deps
      .updateDataTableView({
        ...target,
        name: updates.name ?? target.name,
        type: finalType,
        config: finalConfig,
      })
      .catch(error => {
        console.error("更新视图失败:", error);
        return null;
      });

    if (!updated) return null;

    setViews(prev =>
      prev
        .map(view => (view.id === updated.id ? updated : view))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    );
    return updated;
  };

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
}

// Context for dependency injection
const EditDatabaseDepsContext = createContext<UseEditDatabaseDeps | null>(null);

// Convenience hook that gets deps from context
export function useEditDatabaseWithContext(tableId: number | undefined): DatabaseHookResult | null {
  const deps = useContext(EditDatabaseDepsContext);
  if (!deps) {
    console.warn("useEditDatabaseWithContext: deps not provided in context");
    throw new Error("useEditDatabaseWithContext: deps not provided in context");
  }
  return useEditDatabase(tableId, deps);
}

// Provider component
export function EditDatabaseDepsProvider({
  children,
  deps,
}: {
  children: React.ReactNode;
  deps: UseEditDatabaseDeps;
}) {
  return (
    <EditDatabaseDepsContext.Provider value={deps}>{children}</EditDatabaseDepsContext.Provider>
  );
}
