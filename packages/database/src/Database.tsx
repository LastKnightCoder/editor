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

import {
  CellPlugin,
  DatabaseProps,
  RowData,
  DataTableViewType,
  DatabaseQuery,
  DatabaseCommand,
  DatabaseChange,
} from "./types";
import { createDatabaseStore } from "./DatabaseStore";
import { builtInPlugins } from "./plugins";
import PluginManager from "./PluginManager";
import { useColumnResize, useKeyboardNavigation } from "./hooks";
import { DatabaseContext } from "./DatabaseContext";
import TableView from "./views/TableView";
import GalleryView from "./views/GalleryView";
import CalendarView from "./views/CalendarView";
import KanbanView from "./views/KanbanView";
import ViewTabs from "./ViewTabs";

const defaultPlugins: DatabaseProps["plugins"] = [];

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
      plugins = defaultPlugins,
      slots = {},
      onRowCleanup,
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
    const pluginMgr = useCreation(() => {
      const pluginMgr = new PluginManager();
      pluginMgr.registerPlugins(builtInPlugins as CellPlugin<unknown>[]);
      if (plugins.length > 0) {
        pluginMgr.registerPlugins(plugins);
      }
      pluginMgr.loadAllPlugins();
      return pluginMgr;
    }, []);
    const store = useCreation(
      () =>
        createDatabaseStore(
          columns,
          data,
          viewConfig,
          views,
          activeViewId,
          pluginMgr,
          onRowCleanup
        ),
      []
    );

    const systemTheme = useThemeStore(state => state.mode);
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
        store.getState().commitHistory();
        store.getState().dispatch({
          type: "rows.apply",
          changes: { upsert: [{ ...data, id: rowId }], remove: [] },
        });
      },
      getRows: () => {
        return store.getState().rows;
      },
    }));

    useEffect(() => {
      const unsubscribe = store.subscribe((state, prevState) => {
        const change = state.lastChange;
        if (!change || change === prevState.lastChange || change.source !== "user") return;
        if (change.dataChanged)
          onDataChange?.({ columns: state.columns, rows: state.rows }, change);
        if (change.viewChanged) onViewConfigChange?.(state.viewConfig);
      });

      return () => {
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

    const handleCreateView = useMemoizedFn(
      async (
        type: DataTableViewType,
        name: string,
        dateColumnId?: string,
        groupColumnId?: string
      ) => {
        const { views, activeViewId, viewConfig } = store.getState();
        const currentView = views.find(view => view.id === activeViewId);
        if (!currentView) return;
        const nextOrder = Math.max(0, ...views.map(view => view.order ?? 0)) + 1;

        // 构建视图配置
        const config = { ...viewConfig };

        // 如果是日历视图，添加日期列配置
        if (type === "calendar" && dateColumnId) {
          config.calendarConfig = {
            dateColumnId,
          };
        }

        // 如果是看板视图，添加分组列配置
        if (type === "kanban" && groupColumnId) {
          config.kanbanConfig = {
            groupColumnId,
            cardDisplay: {
              template: "task",
              showFieldLabels: false,
            },
          };
        }

        const result = await onCreateView?.({
          tableId: currentView.tableId,
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
      if (result) {
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

      const viewProps = {
        pluginManager: pluginMgr,
        theme: finalTheme,
        readonly: !!readonly,
        onRowDetailOpen,
        onRowAdd,
        onRowDelete,
        config,
      };

      if (activeView.type === "table") {
        return <TableView key={activeView.id} {...viewProps} startResize={startResize} />;
      }

      if (activeView.type === "gallery") {
        return <GalleryView key={activeView.id} {...viewProps} />;
      }

      if (activeView.type === "calendar") {
        return <CalendarView key={activeView.id} {...viewProps} bare={bare} />;
      }

      if (activeView.type === "kanban") {
        return <KanbanView key={activeView.id} {...viewProps} />;
      }
    }, [
      storeActiveViewId,
      storeViews,
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
        <DatabaseContext.Provider value={store}>
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
        </DatabaseContext.Provider>
      </DatabaseHostContext.Provider>
    );
  }
);

Database.displayName = "Database";

export default Database;
