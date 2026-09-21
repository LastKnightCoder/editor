import React, { memo } from "react";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";

import { CellValue, ColumnDef, CellPlugin, RowData } from "../../../types";
import { useCellEditor, useValidation } from "../../../hooks";
import PrimaryColumnRenderer from "../../../plugins/TextPlugin/PrimaryColumnRenderer";

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
  row?: RowData;
  onOpenRowDetail?: (row: RowData) => void;
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
    column: ColumnDef;
    theme: "light" | "dark";
    readonly: boolean;
    onCellValueChange: (value: CellValue) => void;
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
  }
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
      <div className="relative h-full w-full">
        <Editor
          value={value}
          column={column}
          onCellValueChange={onCellValueChange}
          onFinishEdit={onFinishEdit}
          onColumnChange={onColumnChange}
          theme={theme}
          readonly={readonly}
          autoOpen
        />
      </div>
    );
  }
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
    row,
    onOpenRowDetail,
  }) => {
    // 检查列级别和全局 readonly
    const isColumnReadonly = Boolean(readonly || column.readonly);

    const handleDoubleClick = useMemoizedFn(() => {
      const editable = plugin?.editable;
      if (isColumnReadonly || !editable) return;
      onDoubleClick(rowId, columnId);
    });

    const handleValueChange = useMemoizedFn((value: CellValue) => {
      if (isColumnReadonly) return;
      onValueChange(rowId, columnId, value);
    });

    // 设置单元格编辑器状态
    const { draftValue, handleChange, handleSave, handleCancel } = useCellEditor(
      value,
      handleValueChange
    );

    // 设置验证
    const { error } = useValidation(draftValue, column.validation);

    // 处理失焦事件（保存单元格）
    const handleFinishEdit = useMemoizedFn(() => {
      if (isColumnReadonly) return;
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
      if (isColumnReadonly) return;
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
          className={classNames("ring-accent relative z-[3] h-10 overflow-hidden p-0 ring-2")}
          style={cellStyle}
        >
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
              readonly={isColumnReadonly}
            />
          ) : null}
        </div>
      );
    }

    return (
      <div
        className={classNames("relative h-10 overflow-hidden p-0")}
        style={cellStyle}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        {isSelected ? (
          <div className="border-accent pointer-events-none absolute left-0 top-0 box-border h-full w-full border-2" />
        ) : (
          <div className="border-line-2 absolute right-0 top-0 h-full border-r" />
        )}
        {column.isPrimary && row ? (
          <PrimaryColumnRenderer
            value={value}
            column={column}
            theme={theme}
            readonly={isColumnReadonly}
            onCellValueChange={handleValueChange}
            row={row}
            onOpenDetail={onOpenRowDetail}
          />
        ) : plugin ? (
          <MemoizedRenderer
            plugin={plugin}
            value={value}
            column={column}
            theme={theme}
            readonly={isColumnReadonly}
            onCellValueChange={handleValueChange}
          />
        ) : null}
      </div>
    );
  }
);

export default Cell;
