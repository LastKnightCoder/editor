import { createContext, useContext, useEffect, useState, useRef } from "react";
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
  DataTableTarget,
  UpdateDataTableView,
} from "../types/database";

// Export only hook-specific types
export type UseEditDatabaseResult = DatabaseHookResult;

// Dependency injection interface
export interface UseEditDatabaseDeps {
  updateDataTableChanges?: (input: {
    id: DataTableTarget;
    rows: DatabaseRowChanges;
    columns?: ColumnDef[];
  }) => Promise<DataTable | null>;
  getDataTableDetail: (
    tableId: DataTableTarget
  ) => Promise<{ table: DataTable | null; views: DataTableView[] }>;
  updateDataTable: (
    data: DatabaseData & {
      id: DataTableTarget;
      activeViewId: number | null;
    }
  ) => Promise<DataTable | null>;
  updateDataTableView: (view: UpdateDataTableView) => Promise<DataTableView | null>;
  createDataTableView: (view: CreateDataTableView) => Promise<DataTableView | null>;
  deleteDataTableView: (view: { id: number; tableId: DataTableTarget }) => Promise<number>;
  setActiveDataTableView: (tableId: DataTableTarget, viewId: number | null) => Promise<boolean>;
  reorderDataTableViews: (tableId: DataTableTarget, orderedIds: number[]) => Promise<void>;
}

// Base hook with explicit dependencies
export function useEditDatabase(
  tableId: DataTableTarget | undefined,
  deps?: UseEditDatabaseDeps
): DatabaseHookResult | null {
  const [activeViewId, setActiveViewId] = useState<number | null>(null);
  const [views, setViews] = useState<DataTableView[]>([]);
  const [table, setTable] = useState<DataTable | null>(null);
  const targetKey = JSON.stringify(tableId);
  const currentTarget = useRef(targetKey);
  currentTarget.current = targetKey;
  const [loadedTarget, setLoadedTarget] = useState<string>();
  const [error, setError] = useState<string>();
  const current = () => currentTarget.current === targetKey;

  useEffect(() => {
    if (!deps) {
      console.warn("useEditDatabase: deps not provided");
      return;
    }

    if (!tableId) return;

    let active = true;
    setError(undefined);
    deps
      .getDataTableDetail(tableId)
      .then(({ table: dataTable, views: viewList }) => {
        if (!active) return;
        setLoadedTarget(targetKey);
        if (!dataTable || !viewList) return;
        setTable(dataTable);
        setViews(viewList);
        setActiveViewId(dataTable.activeViewId ?? viewList[0]?.id ?? null);
      })
      .catch(failure => {
        if (!active) return;
        setTable(null);
        setLoadedTarget(targetKey);
        setError(failure instanceof Error ? failure.message : "数据表读取失败");
      });

    return () => {
      active = false;
      setTable(null);
      setViews([]);
      setActiveViewId(null);
    };
  }, [targetKey, deps]);

  if (!deps) {
    return null;
  }

  const onDataChange = async (data: DatabaseData, change?: DatabaseDataChange) => {
    if (!table || !tableId || loadedTarget !== targetKey || !current()) return;
    const updated =
      change && deps.updateDataTableChanges
        ? await deps.updateDataTableChanges({
            id: tableId,
            rows: change.rows,
            ...(change.columnsChanged ? { columns: data.columns } : {}),
          })
        : await deps.updateDataTable({
            id: tableId,
            columns: data.columns,
            rows: data.rows,
            activeViewId: table.activeViewId,
          });
    if (updated && current()) {
      setTable(updated);
    }
  };

  const onViewConfigChange = async (config: TableViewConfig) => {
    if (!table || activeViewId == null || loadedTarget !== targetKey || !current()) return;
    const currentView = views.find(view => view.id === activeViewId);
    if (!currentView) return;
    const updated = await deps.updateDataTableView({
      ...currentView,
      tableId: tableId!,
      config: {
        ...currentView.config,
        ...config,
      },
    });
    if (updated && current()) {
      setViews(prev => prev.map(view => (view.id === updated.id ? updated : view)));
    }
  };

  const onCreateView = async (view: CreateDataTableView) => {
    if (loadedTarget !== targetKey || !current()) return null;
    const newView = await deps.createDataTableView({ ...view, tableId: tableId! }).catch(e => {
      console.error("创建视图失败:", e);
      return null;
    });
    if (!newView || !current()) return null;
    setViews(prev => [...prev, newView].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    onActiveViewIdChange(newView.id);
    return newView;
  };

  const onDeleteView = async (viewId: number) => {
    if (views.length === 1 || loadedTarget !== targetKey || !current()) return null;
    const result = await deps.deleteDataTableView({ id: viewId, tableId: tableId! }).catch(e => {
      console.error("删除视图失败:", e);
      return null;
    });
    if (!result || !current()) return null;
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
    if (!tableId || loadedTarget !== targetKey || !current()) return;

    const result = await deps.setActiveDataTableView(tableId, viewId).catch(e => {
      console.error("设置活跃视图失败:", e);
      return null;
    });
    if (!result || !current()) return;

    setActiveViewId(viewId);
  };

  const onRenameView = async (viewId: number, name: string) => {
    if (loadedTarget !== targetKey || !current()) return null;
    const target = views.find(view => view.id === viewId);
    if (!target) return null;
    const updated = await deps
      .updateDataTableView({
        ...target,
        tableId: tableId!,
        name,
      })
      .catch(error => {
        console.error("更新视图名称失败:", error);
        return null;
      });
    if (!updated || !current()) return null;
    setViews(prev =>
      prev
        .map(view => (view.id === updated.id ? updated : view))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    );
    return updated;
  };

  const onReorderViews = async (orderedIds: number[]) => {
    if (!tableId || loadedTarget !== targetKey || !current()) return;
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
    if (loadedTarget !== targetKey || !current()) return null;
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
        tableId: tableId!,
        name: updates.name ?? target.name,
        type: finalType,
        config: finalConfig,
      })
      .catch(error => {
        console.error("更新视图失败:", error);
        return null;
      });

    if (!updated || !current()) return null;

    setViews(prev =>
      prev
        .map(view => (view.id === updated.id ? updated : view))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    );
    return updated;
  };

  return {
    loading: Boolean(tableId) && loadedTarget !== targetKey,
    error,
    activeViewId,
    views,
    table: loadedTarget === targetKey ? table : null,
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
export function useEditDatabaseWithContext(
  tableId: DataTableTarget | undefined
): DatabaseHookResult | null {
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
