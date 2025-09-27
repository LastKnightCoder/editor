import React, { useEffect, ReactNode, memo, useMemo } from "react";
import { useCreation, useMemoizedFn } from "ahooks";
import { App, Form, Input } from "antd";
import classnames from "classnames";
import useTheme from "@/hooks/useTheme";

import { CellPlugin, DatabaseProps } from "./types";
import { createDatabaseStore } from "./DatabaseStore";
import { builtInPlugins } from "./plugins";
import PluginManager from "./PluginManager";
import { useColumnResize, useKeyboardNavigation } from "./hooks";
import { DatabaseContext } from "./DatabaseContext";
import TableView from "./views/TableView";
import ViewTabs from "./ViewTabs";

const defaultPlugins: DatabaseProps["plugins"] = [];

const Database: React.FC<DatabaseProps> = memo(
  ({
    columns,
    data,
    activeViewId,
    onActiveViewIdChange,
    viewConfig,
    onViewConfigChange,
    onCreateView,
    onDeleteView,
    onRenameView,
    onReorderViews,
    views,
    plugins = defaultPlugins,
    onDataChange,
    theme,
    readonly,
    className,
  }): ReactNode => {
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
    const [form] = Form.useForm<{ name: string }>();

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

    const openCreateViewModal = useMemoizedFn(() => {
      const currentView = views.find((view) => view.id === activeViewId);
      if (!currentView) return;
      const defaultName = `${currentView.name} 副本`;
      form.setFieldsValue({ name: defaultName });
      modal.confirm({
        title: "新建视图",
        content: (
          <Form form={form} layout="vertical">
            <Form.Item
              label="视图名称"
              name="name"
              rules={[{ required: true, message: "请输入视图名称" }]}
            >
              <Input placeholder="请输入视图名称" maxLength={50} />
            </Form.Item>
          </Form>
        ),
        okText: "创建",
        cancelText: "取消",
        onOk: async () => {
          const values = await form.validateFields();
          await handleCreateView(values.name);
        },
      });
    });

    const handleCreateView = useMemoizedFn(async (name: string) => {
      const currentView = views.find((view) => view.id === activeViewId);
      if (!currentView) return;
      const nextOrder =
        Math.max(0, ...views.map((view) => view.order ?? 0)) + 1;
      const result = await onCreateView?.({
        tableId: currentView.tableId,
        type: currentView.type,
        config: currentView.config,
        name,
        order: nextOrder,
      });
      if (result) {
        store.setState((prev) => ({
          ...prev,
          views: [...prev.views, result],
          activeViewId: result.id,
        }));
        onActiveViewIdChange?.(result.id);
      }
    });

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

    const View = useMemo(() => {
      const activeView = views.find((view) => view.id === activeViewId);
      if (!activeView) return null;

      if (activeView.type === "table") {
        return (
          <TableView
            key={activeView.id}
            pluginManager={pluginMgr}
            startResize={startResize}
            theme={finalTheme}
            readonly={!!readonly}
          />
        );
      }
    }, [activeViewId, views, pluginMgr, startResize, finalTheme, readonly]);

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
          <div className="flex-shrink-0">
            <ViewTabs
              onCreateView={openCreateViewModal}
              onDeleteView={handleDeleteView}
              onActiveViewIdChange={onActiveViewIdChange}
              onRenameView={handleRenameView}
              onReorderViews={handleReorderViews}
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
