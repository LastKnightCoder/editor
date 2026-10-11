import {
  useEffect,
  ReactNode,
  useMemo,
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useCreation, useMemoizedFn } from "ahooks";
import { ConfirmDialog, cn, isEditableTarget } from "@tau/ui";
import { useThemeStore } from "@tau/themes/react";
import { DatabaseHostContext } from "./DatabaseHostContext";
import { DatabaseWriteContext } from "./DatabaseWriteContext";
import { DatabaseFocusContext } from "./DatabaseFocusContext";

import {
  CellPlugin,
  DatabaseProps,
  RowData,
  DatabaseViewType,
  DatabaseQuery,
  DatabaseCommand,
  DatabaseChange,
} from "./types";
import { createDatabaseStore } from "./DatabaseStore";
import { builtInPlugins } from "./plugins";
import { upgradeColumns } from "./model/config-version";
import type { DatabaseFieldModel } from "./model/field-model";
import { installDatabaseExtensions, type DatabaseExtension } from "./extensions";
import { useColumnResize, useKeyboardNavigation, useUndoRedoShortcut } from "./hooks";
import { DatabaseContext } from "./DatabaseContext";
import { ViewRegistryContext } from "./views/ViewRegistryContext";
import MissingView from "./components/MissingView";
import ViewTabs from "./ViewTabs";

const emptyExtensions: readonly DatabaseExtension[] = [];

export interface DatabaseRef {
  deleteRow: (rowId: string) => void;
  addRow: (rowData?: Partial<RowData>) => void;
  updateRow: (rowId: string, data: Partial<RowData>) => void;
  getRows: () => RowData[];
  dispatch: (command: DatabaseCommand, source?: DatabaseChange["source"]) => void;
  setQuery: (query: Partial<DatabaseQuery>) => void;
}

const Database = forwardRef<DatabaseRef, DatabaseProps>(
  (
    {
      columns,
      data,
      activeViewId,
      onActiveViewIdChange,
      viewConfig,
      onViewConfigChange,
      onCreateView,
      onDeleteView,
      onRenameView,
      onUpdateView,
      onReorderViews,
      views,
      config,
      extensions = emptyExtensions,
      onRowCleanup,
      onDetachedRowPatch,
      onDataChange,
      onRowDetailOpen,
      onRowAdd,
      onRowDelete,
      theme,
      readonly,
      bare = false,
      className,
    },
    ref
  ): ReactNode => {
    const rootRef = useRef<HTMLDivElement>(null);
    const restoreFocus = useMemoizedFn(() => {
      const active = document.activeElement;
      if (active === document.body || !active?.isConnected) {
        rootRef.current?.focus({ preventScroll: true });
      }
    });
    const {
      pluginManager: pluginMgr,
      viewRegistry,
      slots,
      activators,
    } = useCreation(
      () => installDatabaseExtensions(builtInPlugins as CellPlugin<unknown>[], extensions),
      []
    );
    const initialExtensions = useRef(extensions);
    if (extensions !== initialExtensions.current) throw new Error("Database 扩展集合必须稳定");
    useEffect(() => {
      const cleanups = activators
        .map(activate => activate())
        .filter((cleanup): cleanup is () => void => cleanup !== undefined);
      return () => {
        for (const cleanup of cleanups.reverse()) cleanup();
      };
    }, [activators]);
    const store = useCreation(
      () =>
        createDatabaseStore(
          // 初始列先按字段 model 升级配置版本（D-130）：升级不触发保存，随用户下次修改落库
          upgradeColumns(
            columns,
            pluginMgr
              .getAllPlugins()
              .map(plugin => plugin.model)
              .filter((model): model is DatabaseFieldModel => Boolean(model))
          ),
          data,
          viewConfig,
          views,
          activeViewId,
          pluginMgr,
          viewRegistry,
          onRowCleanup
        ),
      []
    );

    const systemTheme = useThemeStore(state => state.mode);
    const subscriptionActive = useRef(false);
    const commitRowPatch = useMemoizedFn((rowId: string, patch: Partial<RowData>) => {
      const state = store.getState();
      const previousRow = state.rows.find(row => row.id === rowId);
      if (!previousRow) return false;
      const values: RowData = Object.assign(Object.create(null), { id: rowId });
      for (const [field, value] of Object.entries(patch)) {
        if (field === "id") continue;
        const column = state.columns.find(item => item.id === field);
        values[field] = column
          ? pluginMgr.transformBeforeSave(column.type, value, column.config)
          : value;
      }
      if (Object.keys(values).length === 1) return;
      if (!subscriptionActive.current) {
        if (!onDetachedRowPatch) return false;
        return onDetachedRowPatch(rowId, values, previousRow).then(applied => {
          const current = store.getState().rows.find(row => row.id === rowId);
          if (applied && current) {
            const upsert: RowData = { id: rowId };
            for (const field of Object.keys(values)) {
              if (
                field !== "id" &&
                JSON.stringify(current[field]) === JSON.stringify(previousRow[field])
              ) {
                upsert[field] = values[field];
              }
            }
            if (Object.keys(upsert).length > 1) {
              store
                .getState()
                .dispatch(
                  { type: "rows.apply", changes: { upsert: [upsert], remove: [] } },
                  "external"
                );
            }
          }
          return applied;
        });
      }
      state.dispatch({ type: "rows.apply", changes: { upsert: [values], remove: [] } }, "user");
      state.commitHistory();
      return true;
    });
    const finalTheme = theme || systemTheme;

    const [confirmDeleteViewId, setConfirmDeleteViewId] = useState<number | null>(null);

    // 暴露 ref 方法
    useImperativeHandle(ref, () => ({
      dispatch: (command, source) => store.getState().dispatch(command, source),
      setQuery: query => store.getState().setQuery(query),
      deleteRow: (rowId: string) => {
        store.getState().deleteRow(rowId);
      },
      addRow: (rowData?: Partial<RowData>) => {
        store.getState().addRow(rowData);
      },
      updateRow: (rowId: string, data: Partial<RowData>) => {
        if (!store.getState().rows.some(row => row.id === rowId)) return;
        store.getState().dispatch({
          type: "rows.apply",
          changes: { upsert: [{ ...data, id: rowId }], remove: [] },
        });
        store.getState().commitHistory();
      },
      getRows: () => {
        return store.getState().rows;
      },
    }));

    useEffect(() => {
      subscriptionActive.current = true;
      const unsubscribe = store.subscribe((state, prevState) => {
        const change = state.lastChange;
        if (!change || change === prevState.lastChange || change.source !== "user") return;
        if (change.dataChanged)
          onDataChange?.({ columns: state.columns, rows: state.rows }, change);
        if (change.viewChanged) onViewConfigChange?.(state.viewConfig);
      });

      return () => {
        subscriptionActive.current = false;
        unsubscribe();
      };
    }, [store, onDataChange, onViewConfigChange]);

    const { isResizing, startResize } = useColumnResize((columnId, width) => {
      store.getState().resizeColumn(columnId, width);
    });

    useKeyboardNavigation(
      direction => {
        store.getState().moveCellSelection(direction);
      },
      e => {
        const { selectedCell, editingCell, columns } = store.getState();
        if (selectedCell && !editingCell && !readonly) {
          const column = columns.find(col => col.id === selectedCell.columnId);
          if (!column) return;
          const plugin = pluginMgr.getPlugin(column.type);
          if (!plugin) return;
          if (plugin.editable) {
            e.preventDefault();
            e.stopPropagation();
            store.getState().startEditing(selectedCell.rowId, selectedCell.columnId);
          }
        }
      },
      rootRef
    );

    useUndoRedoShortcut(
      () => store.getState().undo(),
      () => store.getState().redo(),
      {
        enabled: () => !readonly && !store.getState().editingCell,
        scope: rootRef,
      }
    );

    const handleCreateView = useMemoizedFn(
      async (type: DatabaseViewType, name: string, columnId?: string) => {
        const { views, viewConfig } = store.getState();
        const nextOrder = Math.max(0, ...views.map(view => view.order ?? 0)) + 1;

        // 构建视图配置：视图定义声明 createOptions 时写入 viewOptions[type]，
        // 其余子键保持不动，避免整体覆盖当前视图已有的其它类型配置
        const createdOptions = viewRegistry.get(type)?.createOptions?.(columnId);
        const config =
          createdOptions === undefined
            ? { ...viewConfig }
            : {
                ...viewConfig,
                viewOptions: { ...viewConfig.viewOptions, [type]: createdOptions },
              };

        const result = await onCreateView?.({
          type,
          config,
          name,
          order: nextOrder,
        });

        if (result) {
          store
            .getState()
            .dispatch({ type: "view.receive", view: result, activate: true }, "external");

          onActiveViewIdChange?.(result.id);
        }
      }
    );

    const handleDeleteView = useMemoizedFn(async (viewId: number) => {
      setConfirmDeleteViewId(viewId);
    });

    const handleConfirmDeleteView = useMemoizedFn(async () => {
      const viewId = confirmDeleteViewId;
      if (viewId === null) return;
      const result = await onDeleteView?.(viewId);
      if (result !== null && result !== undefined) {
        store.getState().dispatch({ type: "view.remove", id: viewId }, "external");
        onActiveViewIdChange?.(store.getState().activeViewId);
      }
    });

    const handleRenameView = useMemoizedFn(async (viewId: number, name: string) => {
      if (!onRenameView) return;
      const result = await onRenameView(viewId, name);
      if (result) {
        const current = store.getState().views.find(view => view.id === viewId);
        if (current)
          store
            .getState()
            .dispatch(
              { type: "view.receive", view: { ...current, name: result.name } },
              "external"
            );
      }
    });

    const handleUpdateView = useMemoizedFn(
      async (
        viewId: number,
        updates: Parameters<NonNullable<DatabaseProps["onUpdateView"]>>[1]
      ) => {
        if (!onUpdateView) return;

        // 调用后端 API 保存视图更新
        const updated = await onUpdateView(viewId, updates);
        if (!updated) return;

        store.getState().dispatch({ type: "view.receive", view: updated }, "external");
      }
    );

    const handleReorderViews = useMemoizedFn((orderedIds: number[]) => {
      store.getState().dispatch({ type: "views.reorder", ids: orderedIds });
      onReorderViews?.(orderedIds);
    });

    const storeActiveViewId = store(state => state.activeViewId);
    const storeViews = store(state => state.views);

    const View = useMemo(() => {
      const activeView = storeViews.find(view => view.id === storeActiveViewId);
      if (!activeView) return null;

      // 视图类型未注册（如扩展被移除）：渲染通用占位，数据与 viewOptions 原样保留
      const definition = viewRegistry.get(activeView.type);
      if (!definition) return <MissingView key={activeView.id} type={activeView.type} />;

      const viewProps = {
        pluginManager: pluginMgr,
        theme: finalTheme,
        readonly: !!readonly,
        onRowDetailOpen,
        onRowAdd,
        onRowDelete,
        config,
        startResize,
        bare,
      };

      return <definition.Component key={activeView.id} {...viewProps} />;
    }, [
      storeActiveViewId,
      storeViews,
      viewRegistry,
      pluginMgr,
      startResize,
      finalTheme,
      readonly,
      onRowDetailOpen,
      onRowAdd,
      onRowDelete,
      config,
      store,
      bare,
    ]);

    return (
      <DatabaseHostContext.Provider value={slots}>
        <DatabaseFocusContext.Provider value={restoreFocus}>
          <DatabaseWriteContext.Provider value={commitRowPatch}>
            <DatabaseContext.Provider value={store}>
              <ViewRegistryContext.Provider value={viewRegistry}>
                <div
                  ref={rootRef}
                  tabIndex={-1}
                  onPointerDownCapture={event => {
                    if (
                      event.target instanceof Node &&
                      rootRef.current?.contains(event.target) &&
                      !isEditableTarget(event.target)
                    ) {
                      rootRef.current.focus({ preventScroll: true });
                    }
                  }}
                  className={cn(
                    "relative flex h-full w-full flex-col overflow-hidden",
                    !bare && "bg-surface border-line-1 shadow-card rounded-tau-md border",
                    className,
                    {
                      "cursor-col-resize select-none": isResizing,
                    }
                  )}
                >
                  <div className="shrink-0">
                    <ViewTabs
                      pluginManager={pluginMgr}
                      viewRegistry={viewRegistry}
                      onCreateView={handleCreateView}
                      onDeleteView={handleDeleteView}
                      onActiveViewIdChange={onActiveViewIdChange}
                      onRenameView={handleRenameView}
                      onUpdateView={handleUpdateView}
                      onReorderViews={handleReorderViews}
                      theme={finalTheme}
                      bare={bare}
                    />
                  </div>
                  <div className="min-h-0 w-full flex-1">{View}</div>
                  <ConfirmDialog
                    open={confirmDeleteViewId !== null}
                    onOpenChange={open => {
                      if (!open) setConfirmDeleteViewId(null);
                    }}
                    title="确定删除此视图吗？"
                    danger
                    confirmText="删除"
                    onConfirm={() => handleConfirmDeleteView()}
                  />
                </div>
              </ViewRegistryContext.Provider>
            </DatabaseContext.Provider>
          </DatabaseWriteContext.Provider>
        </DatabaseFocusContext.Provider>
      </DatabaseHostContext.Provider>
    );
  }
);

Database.displayName = "Database";

export default Database;
