import {
  useEffect,
  ReactNode,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useCreation, useMemoizedFn } from "ahooks";
import { App } from "antd";
import classnames from "classnames";
import useTheme from "@/hooks/useTheme";

import { CellPlugin, DatabaseProps, RowData } from "./types";
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
      onDataChange,
      onRowDetailOpen,
      onRowAdd,
      onRowDelete,
      theme,
      readonly,
      className,
    },
    ref,
  ): ReactNode => {
    const pluginMgr = useCreation(() => {
      const pluginMgr = new PluginManager();
      pluginMgr.registerPlugins(builtInPlugins as CellPlugin<unknown>[]);
      if (plugins.length > 0) {
        pluginMgr.registerPlugins(plugins);
      }
      pluginMgr.loadAllPlugins();
      return pluginMgr;
    }, [plugins]);
    const store = useCreation(
      () => createDatabaseStore(columns, data, viewConfig, views, activeViewId),
      [],
    );

    const { theme: systemTheme } = useTheme();
    const finalTheme = theme || systemTheme;

    const { modal } = App.useApp();

    // 暴露 ref 方法
    useImperativeHandle(ref, () => ({
      deleteRow: (rowId: string) => {
        store.getState().deleteRow(rowId);
      },
      addRow: (rowData?: Partial<RowData>) => {
        store.getState().addRow(rowData);
      },
      updateRow: (rowId: string, data: Partial<RowData>) => {
        Object.keys(data).forEach((key) => {
          if (key !== "id") {
            store.getState().updateCellValue(rowId, key, data[key]);
          }
        });
      },
      getRows: () => {
        return store.getState().rows;
      },
    }));

    useEffect(() => {
      const unsubscribe = store.subscribe((state, prevState) => {
        if (onDataChange) {
          const dataChanged =
            JSON.stringify({ columns: state.columns, rows: state.rows }) !==
            JSON.stringify({
              columns: prevState.columns,
              rows: prevState.rows,
            });

          if (dataChanged) {
            onDataChange({
              columns: state.columns,
              rows: state.rows,
            });
          }
        }

        if (onViewConfigChange) {
          const viewConfigChanged =
            JSON.stringify(state.viewConfig) !==
            JSON.stringify(prevState.viewConfig);
          if (viewConfigChanged) {
            onViewConfigChange(state.viewConfig);
          }
        }
      });

      return () => {
        unsubscribe();
      };
    }, [store, onDataChange, onViewConfigChange]);

    const { isResizing, startResize } = useColumnResize((columnId, width) => {
      store.getState().resizeColumn(columnId, width);
    });

    useKeyboardNavigation(
      (direction) => {
        store.getState().moveCellSelection(direction);
      },
      (e) => {
        const { selectedCell, editingCell } = store.getState();
        if (selectedCell && !editingCell && !readonly) {
          const column = columns.find(
            (col) => col.id === selectedCell.columnId,
          );
          if (!column) return;
          const plugin = pluginMgr.getPlugin(column.type);
          if (!plugin) return;
          if (plugin.editable) {
            e.preventDefault();
            e.stopPropagation();
            store
              .getState()
              .startEditing(selectedCell.rowId, selectedCell.columnId);
          }
        }
      },
    );

    const handleCreateView = useMemoizedFn(
      async (
        type: string,
        name: string,
        dateColumnId?: string,
        groupColumnId?: string,
      ) => {
        const currentView = views.find((view) => view.id === activeViewId);
        if (!currentView) return;
        const nextOrder =
          Math.max(0, ...views.map((view) => view.order ?? 0)) + 1;

        // 构建视图配置
        const config = { ...currentView.config };

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
          };
        }

        const result = await onCreateView?.({
          tableId: currentView.tableId,
          type: type as "table" | "gallery" | "calendar" | "kanban",
          config,
          name,
          order: nextOrder,
        });

        if (result) {
          store.setState((prev) => ({
            ...prev,
            views: [...prev.views, result],
            activeViewId: result.id,
          }));

          // 如果是日历视图，更新 store 中的 calendarConfig
          if (type === "calendar" && result.config.calendarConfig) {
            store.getState().setCalendarConfig(result.config.calendarConfig);
          }

          // 如果是看板视图，更新 store 中的 kanbanConfig
          if (type === "kanban" && result.config.kanbanConfig) {
            store.getState().setKanbanConfig(result.config.kanbanConfig);
          }

          onActiveViewIdChange?.(result.id);
        }
      },
    );

    const handleDeleteView = useMemoizedFn(async (viewId: number) => {
      modal.confirm({
        title: "确定删除此视图吗？",
        okButtonProps: {
          danger: true,
        },
        onOk: async () => {
          const result = await onDeleteView?.(viewId);
          if (result) {
            store.setState({
              views: views.filter((view) => view.id !== viewId),
              activeViewId: views[0]?.id ?? null,
            });
            onActiveViewIdChange?.(views[0]?.id ?? null);
          }
        },
      });
    });

    const handleRenameView = useMemoizedFn(
      async (viewId: number, name: string) => {
        if (!onRenameView) return;
        const result = await onRenameView(viewId, name);
        if (result) {
          store.setState((prev) => ({
            ...prev,
            views: prev.views.map((view) =>
              view.id === result.id ? { ...view, name: result.name } : view,
            ),
          }));
        }
      },
    );

    const handleUpdateView = useMemoizedFn(
      async (
        viewId: number,
        updates: {
          name?: string;
          type?: "table" | "gallery" | "calendar" | "kanban";
          galleryConfig?: {
            coverType: "detail" | "image";
            coverImageColumnId?: string;
          };
          calendarConfig?: {
            dateColumnId?: string;
          };
          kanbanConfig?: {
            groupColumnId: string;
            columnOrder?: string[];
          };
        },
      ) => {
        if (!onUpdateView) return;

        // 调用后端 API 保存视图更新
        const updated = await onUpdateView(viewId, updates);
        if (!updated) return;

        // 更新本地 store
        store.setState((prev) => ({
          ...prev,
          views: prev.views.map((v) => (v.id === updated.id ? updated : v)),
        }));

        // 如果更新的是当前活动视图，同时更新 viewConfig
        const currentActiveViewId = store.getState().activeViewId;
        if (viewId === currentActiveViewId) {
          if (updated.config.galleryConfig) {
            store.getState().setGalleryConfig(updated.config.galleryConfig);
          }
          if (updated.config.calendarConfig) {
            store.getState().setCalendarConfig(updated.config.calendarConfig);
          }
          if (updated.config.kanbanConfig) {
            store.getState().setKanbanConfig(updated.config.kanbanConfig);
          }
        }
      },
    );

    const handleReorderViews = useMemoizedFn((orderedIds: number[]) => {
      store.setState((prev) => {
        const ordered = orderedIds
          .map((id) => prev.views.find((view) => view.id === id))
          .filter((view): view is (typeof prev.views)[number] => !!view)
          .map((view, index) => ({ ...view, order: index }));
        return {
          ...prev,
          views: ordered,
        };
      });
      onReorderViews?.(orderedIds);
    });

    const storeActiveViewId = store((state) => state.activeViewId);
    const storeViews = store((state) => state.views);

    useEffect(() => {
      const currentView = storeViews.find((v) => v.id === storeActiveViewId);
      if (currentView) {
        store.getState().setViewConfig(currentView.config);
      }
    }, [storeActiveViewId, storeViews, store]);

    const View = useMemo(() => {
      const activeView = storeViews.find(
        (view) => view.id === storeActiveViewId,
      );
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
        return (
          <TableView
            key={activeView.id}
            {...viewProps}
            startResize={startResize}
          />
        );
      }

      if (activeView.type === "gallery") {
        return <GalleryView key={activeView.id} {...viewProps} />;
      }

      if (activeView.type === "calendar") {
        return <CalendarView key={activeView.id} {...viewProps} />;
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
      config,
      store,
    ]);

    return (
      <DatabaseContext.Provider value={store}>
        <div
          className={classnames(
            "relative w-full h-full flex flex-col",
            className,
            {
              "cursor-col-resize select-none": isResizing,
            },
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
            />
          </div>
          <div className="w-full flex-1 min-h-0">{View}</div>
        </div>
      </DatabaseContext.Provider>
    );
  },
);

Database.displayName = "Database";

export default Database;
