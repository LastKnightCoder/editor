import React, { memo } from "react";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";
import EditText from "@/components/EditText";

import { CellValue, ColumnDef, CellPlugin } from "../../types";
import { useCellEditor, useValidation } from "../../hooks";
import styles from "./index.module.less";

interface CellProps {
  rowId: string;
  columnId: string;
  column: ColumnDef;
  value: CellValue;
  width: number;
  isSelected: boolean;
  isEditing: boolean;
  plugin: CellPlugin | undefined; // 单元格插件
  onSelect: (rowId: string, columnId: string) => void;
  onDoubleClick: (rowId: string, columnId: string) => void;
  onStartEditing: (rowId: string, columnId: string) => void;
  onStopEditing: () => void;
  onValueChange: (value: CellValue, rowId: string, columnId: string) => void;
  onColumnChange: (column: ColumnDef) => void;
}

// 包装插件渲染器组件
const MemoizedRenderer = memo(
  ({
    plugin,
    value,
    config,
    column,
  }: {
    plugin: CellPlugin;
    value: CellValue;
    config?: any;
    column: ColumnDef;
  }) => {
    const Renderer = plugin.Renderer;
    return <Renderer value={value} config={config} column={column} />;
  },
);

const MemoizedEditor = memo(
  ({
    plugin,
    value,
    config,
    column,
    onCellValueChange,
    onBlur,
    onColumnChange,
  }: {
    plugin: CellPlugin & { Editor: NonNullable<CellPlugin["Editor"]> };
    value: CellValue;
    config?: any;
    column: ColumnDef;
    onCellValueChange: (value: CellValue) => void;
    onBlur: () => void;
    onColumnChange: (column: ColumnDef) => void;
  }) => {
    const Editor = plugin.Editor;
    return (
      <div className={styles.cellEditor}>
        <Editor
          value={value}
          config={config}
          column={column}
          onCellValueChange={onCellValueChange}
          onBlur={onBlur}
          onColumnChange={onColumnChange}
        />
      </div>
    );
  },
);

/**
 * 表格单元格组件
 */
const Cell: React.FC<CellProps> = memo(
  ({
    column,
    value,
    width,
    isSelected,
    isEditing,
    plugin,
    onSelect,
    onDoubleClick,
    onStartEditing,
    onStopEditing,
    onValueChange,
    rowId,
    columnId,
    onColumnChange,
  }) => {
    const handleDoubleClick = useMemoizedFn(() => {
      onDoubleClick(rowId, columnId);
    });

    const handleValueChange = useMemoizedFn((value: CellValue) => {
      onValueChange(value, rowId, columnId);
    });

    // 设置单元格编辑器状态
    const { draftValue, handleChange, handleSave, handleCancel } =
      useCellEditor(value, handleValueChange);

    // 设置验证
    const { error } = useValidation(draftValue, column.validation);

    // 处理失焦事件（保存单元格）
    const handleBlur = useMemoizedFn(() => {
      if (error) {
        handleCancel();
      } else {
        handleSave();
      }
      onStopEditing();
    });

    // 处理单击选择或编辑
    const handleClick = useMemoizedFn(() => {
      if (isSelected) {
        // 如果已经被选中，点击则进入编辑模式
        onStartEditing(rowId, columnId);
      } else {
        // 如果未被选中，点击则选中
        onSelect(rowId, columnId);
      }
    });

    // 单元格样式
    const cellStyle = {
      width: `${width}px`,
      minWidth: `${width}px`,
      maxWidth: `${width}px`,
    };

    // 根据模式渲染
    if (isEditing) {
      return (
        <div
          className={classNames(styles.tableCell, {
            [styles.selected]: isSelected,
            [styles.editing]: isEditing,
          })}
          style={cellStyle}
        >
          {plugin?.Editor ? (
            <MemoizedEditor
              plugin={
                plugin as CellPlugin & {
                  Editor: NonNullable<CellPlugin["Editor"]>;
                }
              }
              value={draftValue}
              config={column.config}
              column={column}
              onCellValueChange={handleChange}
              onBlur={handleBlur}
              onColumnChange={onColumnChange}
            />
          ) : (
            <div className={styles.cellEditor}>
              <EditText
                defaultValue={
                  draftValue !== null && draftValue !== undefined
                    ? String(draftValue)
                    : ""
                }
                onChange={handleChange}
                onBlur={handleBlur}
                onPressEnter={handleBlur}
                contentEditable={true}
                defaultFocus={true}
                className={styles.textEditor}
              />
            </div>
          )}
          {error && <div className={styles.cellError}>{error}</div>}
        </div>
      );
    }

    return (
      <div
        className={classNames(styles.tableCell, {
          [styles.selected]: isSelected,
        })}
        style={cellStyle}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        {plugin ? (
          <MemoizedRenderer
            plugin={plugin}
            value={draftValue}
            config={column.config}
            column={column}
          />
        ) : (
          <div className={styles.fallbackCell}>
            {draftValue !== null && draftValue !== undefined
              ? String(draftValue)
              : ""}
          </div>
        )}
      </div>
    );
  },
);

export default Cell;
