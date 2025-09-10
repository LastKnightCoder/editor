import React, { useEffect, ReactNode, memo } from "react";
import { useCreation } from "ahooks";
import classnames from "classnames";
import useTheme from "@/hooks/useTheme";

import { CellPlugin, TableProps } from "../types";
import { createTableStore } from "../TableStore";
import { builtInPlugins } from "../plugins";
import PluginManager from "../PluginManager";
import { useColumnResize, useKeyboardNavigation } from "../hooks";
import { TableContext } from "../TableContext";
import TableContent from "./TableContent";

const defaultPlugins: TableProps["plugins"] = [];

const Table: React.FC<TableProps> = memo(
  ({
    columns,
    data,
    columnOrder,
    plugins = defaultPlugins,
    onChange,
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
      () => createTableStore(columns, data, columnOrder),
      [],
    );

    const { theme: systemTheme } = useTheme();
    const finalTheme = theme || systemTheme;

    useEffect(() => {
      if (!onChange) return;

      const unsubscribe = store.subscribe((state, prevState) => {
        if (
          JSON.stringify({
            columns: state.columns,
            rows: state.rows,
            columnOrder: state.columnOrder,
          }) ===
          JSON.stringify({
            columns: prevState.columns,
            rows: prevState.rows,
            columnOrder: prevState.columnOrder,
          })
        )
          return;

        onChange({
          columns: state.columns,
          rows: state.rows,
          columnOrder: state.columnOrder,
        });
      });

      return () => {
        unsubscribe();
      };
    }, [store, onChange]);

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
          // 获取 plugin
          const plugin = pluginMgr.getPlugin(column.type);
          if (!plugin) return;
          // 获取 plugin 的编辑器
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

    return (
      <TableContext.Provider value={store}>
        <div
          className={classnames("relative w-full h-full", className, {
            "cursor-col-resize select-none": isResizing,
          })}
        >
          <div className="w-full h-full">
            <TableContent
              pluginManager={pluginMgr}
              startResize={startResize}
              theme={finalTheme}
              readonly={!!readonly}
            />
          </div>
        </div>
      </TableContext.Provider>
    );
  },
);

Table.displayName = "Table";

export default Table;
