import React, { memo } from "react";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";

import { CellValue, ColumnDef, CellPlugin } from "../types";
import { useCellEditor, useValidation } from "../hooks";

interface CellProps {
  rowId: string;
  columnId: string;
  column: ColumnDef;
  value: CellValue;
  width: number;
  isSelected: boolean;
  isEditing: boolean;
  theme: "light" | "dark";
  readonly: boolean;
  plugin: CellPlugin<unknown> | undefined; // 单元格插件
  onSelect: (rowId: string, columnId: string) => void;
  onDoubleClick: (rowId: string, columnId: string) => void;
  onStartEditing: (rowId: string, columnId: string) => void;
  onStopEditing: () => void;
  onValueChange: (rowId: string, columnId: string, value: CellValue) => void;
  onColumnChange: (column: ColumnDef) => void;
}

const MemoizedRenderer = memo(
  ({
    plugin,
    value,
    column,
    theme,
    readonly,
    onCellValueChange,
  }: {
    plugin: CellPlugin<unknown>;
    value: CellValue;
    config?: any;
    column: ColumnDef;
    theme: "light" | "dark";
    readonly: boolean;
    onCellValueChange?: (value: CellValue) => void;
  }) => {
    const Renderer = plugin.Renderer;
    return (
      <Renderer
        value={value}
        column={column}
        theme={theme}
        readonly={readonly}
        onCellValueChange={onCellValueChange}
      />
    );
  },
);

const MemoizedEditor = memo(
  ({
    plugin,
    value,
    column,
    onCellValueChange,
    onFinishEdit,
    onColumnChange,
    theme,
    readonly,
  }: {
    plugin: CellPlugin<unknown> & {
      Editor: NonNullable<CellPlugin<unknown>["Editor"]>;
    };
    value: CellValue;
    column: ColumnDef;
    onCellValueChange: (value: CellValue) => void;
    onFinishEdit: () => void;
    onColumnChange: (column: ColumnDef) => void;
    theme: "light" | "dark";
    readonly: boolean;
  }) => {
    const Editor = plugin.Editor;
    return (
      <div className="w-full h-full relative">
        <Editor
          value={value}
          column={column}
          onCellValueChange={onCellValueChange}
          onFinishEdit={onFinishEdit}
          onColumnChange={onColumnChange}
          theme={theme}
          readonly={readonly}
        />
      </div>
    );
  },
);

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
    theme,
    readonly,
  }) => {
    const isDark = theme === "dark";

    const handleDoubleClick = useMemoizedFn(() => {
      const editable = plugin?.editable;
      if (readonly || !editable) return;
      onDoubleClick(rowId, columnId);
    });

    const handleValueChange = useMemoizedFn((value: CellValue) => {
      if (readonly) return;
      onValueChange(rowId, columnId, value);
    });

    // 设置单元格编辑器状态
    const { draftValue, handleChange, handleSave, handleCancel } =
      useCellEditor(value, handleValueChange);

    // 设置验证
    const { error } = useValidation(draftValue, column.validation);

    // 处理失焦事件（保存单元格）
    const handleFinishEdit = useMemoizedFn(() => {
      if (readonly) return;
      if (error) {
        handleCancel();
      } else {
        handleSave();
      }
      onStopEditing();
    });

    // 处理单击选择或编辑
    const handleClick = useMemoizedFn(() => {
      const editable = plugin?.editable;
      if (readonly) return;
      if (isSelected && editable) {
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
          className={classNames("relative p-0 h-10 overflow-hidden z[3]")}
          style={cellStyle}
        >
          <div
            className={classNames(
              "absolute box-border h-full w-full border pointer-events-none left-0 top-0",
              {
                "border-blue-700": !isDark,
                "border-blue-200": isDark,
              },
            )}
          ></div>
          {plugin?.Editor ? (
            <MemoizedEditor
              plugin={
                plugin as CellPlugin<unknown> & {
                  Editor: NonNullable<CellPlugin<unknown>["Editor"]>;
                }
              }
              value={draftValue}
              column={column}
              onCellValueChange={handleChange}
              onFinishEdit={handleFinishEdit}
              onColumnChange={onColumnChange}
              theme={theme}
              readonly={readonly}
            />
          ) : null}
        </div>
      );
    }

    return (
      <div
        className={classNames("relative p-0 h-10 overflow-hidden")}
        style={cellStyle}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        {isSelected ? (
          <div
            className={classNames(
              "absolute box-border h-full w-full border pointer-events-none left-0 top-0",
              {
                "border-blue-700": !isDark,
                "border-blue-200": isDark,
              },
            )}
          />
        ) : (
          <div
            className={classNames(
              "absolute h-full border-r border-gray-400/50 right-0 top-0",
            )}
          />
        )}
        {plugin ? (
          <MemoizedRenderer
            plugin={plugin}
            value={value}
            column={column}
            theme={theme}
            readonly={readonly}
            onCellValueChange={handleValueChange}
          />
        ) : null}
      </div>
    );
  },
);

export default Cell;
