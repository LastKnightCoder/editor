import React, { useRef, useEffect, ReactNode } from "react";
import { useClickAway, useCreation } from "ahooks";
import classnames from "classnames";
import { TableProps } from "../../types";
import { createTableStore } from "../../TableStore";
import { builtInPlugins } from "../../plugins";
import PluginManager from "../../PluginManager";
import { useColumnResize, useKeyboardNavigation } from "../../hooks";
import { TableContext } from "../../TableContext";
import TableContent from "../TableContent";
import styles from "./index.module.less";

const defaultPlugins: TableProps["plugins"] = [];

/**
 * 表格组件
 * 支持单元格编辑、插件系统、列调整和键盘导航
 */
const Table: React.FC<TableProps> = ({
  columns,
  data,
  plugins = defaultPlugins,
  onChange,
}): ReactNode => {
  const tableRef = useRef<HTMLDivElement>(null);
  const pluginMgr = useCreation(() => new PluginManager(), []);
  const store = useCreation(() => createTableStore(columns, data), []);

  // 注册插件
  useEffect(() => {
    // 注册内置插件
    pluginMgr.registerPlugins(builtInPlugins);

    // 注册自定义插件
    if (plugins.length > 0) {
      pluginMgr.registerPlugins(plugins);
    }

    // 加载所有插件
    pluginMgr.loadAllPlugins();

    // 卸载插件时清理
    return () => {
      pluginMgr.unloadAllPlugins();
    };
  }, [plugins, pluginMgr]);

  // 监听数据变化，触发onChange回调
  useEffect(() => {
    if (!onChange) return;

    const unsubscribe = store.subscribe((state) => {
      onChange({
        columns: state.columns,
        rows: state.rows,
      });
    });

    return () => {
      unsubscribe();
    };
  }, [store, onChange]);

  // 设置列调整大小
  const { isResizing, startResize } = useColumnResize((columnId, width) => {
    store.getState().resizeColumn(columnId, width);
  });

  // 设置键盘导航
  useKeyboardNavigation(
    tableRef,
    (direction) => {
      store.getState().moveCellSelection(direction);
    },
    () => {
      const { selectedCell, editingCell } = store.getState();
      if (selectedCell && !editingCell) {
        store
          .getState()
          .startEditing(selectedCell.rowId, selectedCell.columnId);
      }
    },
  );

  useClickAway(() => {
    store.getState().clearCellSelection();
  }, tableRef.current);

  return (
    <TableContext.Provider value={store}>
      <div
        className={classnames(styles.databaseTable, {
          [styles.resizing]: isResizing,
        })}
        ref={tableRef}
      >
        <TableContent pluginManager={pluginMgr} startResize={startResize} />
      </div>
    </TableContext.Provider>
  );
};

export default Table;
