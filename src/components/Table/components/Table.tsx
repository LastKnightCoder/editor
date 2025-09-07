import React, { useEffect, ReactNode } from "react";
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

const Table: React.FC<TableProps> = ({
  columns,
  data,
  plugins = defaultPlugins,
  onChange,
  theme,
  readonly,
  className,
}): ReactNode => {
  const pluginMgr = useCreation(() => new PluginManager(), []);
  const store = useCreation(() => createTableStore(columns, data), []);

  const { theme: systemTheme } = useTheme();
  const finalTheme = theme || systemTheme;

  useEffect(() => {
    pluginMgr.registerPlugins(builtInPlugins as CellPlugin<unknown>[]);

    if (plugins.length > 0) {
      pluginMgr.registerPlugins(plugins);
    }

    pluginMgr.loadAllPlugins();

    return () => {
      pluginMgr.unloadAllPlugins();
    };
  }, [plugins, pluginMgr]);

  useEffect(() => {
    if (!onChange) return;

    const unsubscribe = store.subscribe((state) => {
      onChange({
        columns: state.columns,
        rows: state.rows,
        columnWidths: state.columnWidths,
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
    () => {
      const { selectedCell, editingCell } = store.getState();
      if (selectedCell && !editingCell && !readonly) {
        store
          .getState()
          .startEditing(selectedCell.rowId, selectedCell.columnId);
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
};

export default Table;
