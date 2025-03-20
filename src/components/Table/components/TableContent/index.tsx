import React from "react";
import { useMemoizedFn } from "ahooks";

import { ColumnDef } from "../../types";
import { useColumnVisibility, useTableStore } from "../../hooks";
import ColumnHeader from "../ColumnHeader";
import Row from "../Row";
import PluginManager from "../../PluginManager";
import ColumnEditModal from "../ColumnEditModal";

import styles from "./index.module.less";

interface TableContentProps {
  pluginManager: PluginManager;
  startResize: (columnId: string, startX: number, startWidth: number) => void;
}

const TableContent: React.FC<TableContentProps> = ({
  pluginManager,
  startResize,
}) => {
  const {
    selectedCell,
    editingCell,
    columns: storeColumns,
    rows: storeRows,
    columnOrder,
    columnWidths,
    selectCell,
    startEditing,
    stopEditing,
    sortColumn,
    addRow,
    addColumn,
    editColumn,
    updateCellValue,
    moveColumn,
    moveRow,
  } = useTableStore((state) => ({
    selectedCell: state.selectedCell,
    editingCell: state.editingCell,
    columns: state.columns,
    rows: state.rows,
    columnOrder: state.columnOrder,
    columnWidths: state.columnWidths,
    selectCell: state.selectCell,
    startEditing: state.startEditing,
    stopEditing: state.stopEditing,
    sortColumn: state.sortColumn,
    addRow: state.addRow,
    addColumn: state.addColumn,
    editColumn: state.editColumn,
    updateCellValue: state.updateCellValue,
    moveColumn: state.moveColumn,
    moveRow: state.moveRow,
  }));

  const onColumnChange = useMemoizedFn((column: ColumnDef) => {
    editColumn(column.id, column);
  });

  // 控制列编辑弹窗
  const [columnEditOpen, setColumnEditOpen] = React.useState(false);
  const [editingColumnId, setEditingColumnId] = React.useState<string | null>(
    null,
  );

  // 使用列可见性hook
  const { isColumnVisible } = useColumnVisibility(storeColumns);

  // 处理列排序
  const handleSort = useMemoizedFn((columnId: string) => {
    sortColumn(columnId);
  });

  // 处理列拖拽移动
  const handleMoveColumn = useMemoizedFn(
    (dragIndex: number, hoverIndex: number) => {
      moveColumn(dragIndex, hoverIndex);
    },
  );

  // 处理行拖拽移动
  const handleMoveRow = useMemoizedFn(
    (dragIndex: number, hoverIndex: number) => {
      moveRow(dragIndex, hoverIndex);
    },
  );

  // 处理行添加
  const handleAddRow = useMemoizedFn(() => {
    addRow();
  });

  // 处理列添加
  const handleAddColumn = useMemoizedFn(() => {
    // 打开新建列弹窗，设置编辑的columnId为null表示新建
    setEditingColumnId(null);
    setColumnEditOpen(true);
  });

  // 处理列编辑
  const handleEditColumn = useMemoizedFn((columnId: string) => {
    setEditingColumnId(columnId);
    setColumnEditOpen(true);
  });

  // 保存列信息
  const handleSaveColumn = useMemoizedFn((columnData: Partial<ColumnDef>) => {
    if (editingColumnId) {
      // 编辑现有列
      editColumn(editingColumnId, columnData);
    } else {
      // 新增列
      addColumn({
        title: columnData.title || `列 ${storeColumns.length + 1}`,
        type: columnData.type || "text",
        ...columnData,
      });
    }
    setColumnEditOpen(false);
    setEditingColumnId(null);
  });

  // 处理单元格值变更
  const handleCellChange = useMemoizedFn(
    (rowId: string, columnId: string, value: any) => {
      updateCellValue(rowId, columnId, value);
    },
  );

  const handleCellDoubleClick = useMemoizedFn(
    (rowId: string, columnId: string) => {
      selectCell(rowId, columnId);
      startEditing(rowId, columnId);
    },
  );

  // 获取可见列的顺序
  const visibleColumnOrder = columnOrder.filter((columnId) =>
    isColumnVisible(columnId),
  );

  // 获取当前编辑的列
  const editingColumn = editingColumnId
    ? storeColumns.find((col) => col.id === editingColumnId) || null
    : null;

  return (
    <>
      <div className={styles.tableContainer}>
        <div className={styles.table}>
          <div className={styles.thead}>
            <div className={styles.tr}>
              {/* 空角落单元格 */}
              <div className={styles.cornerHeader}></div>

              {/* 列标题 */}
              {visibleColumnOrder.map((columnId, index) => {
                const column = storeColumns.find((col) => col.id === columnId);
                if (!column) return null;

                return (
                  <ColumnHeader
                    key={columnId}
                    column={column}
                    width={columnWidths[columnId] || 200}
                    onResizeStart={startResize}
                    onSort={handleSort}
                    sortDirection={column.sortDirection}
                    index={index}
                    moveColumn={handleMoveColumn}
                    onEdit={handleEditColumn}
                  />
                );
              })}

              {/* 添加列按钮 */}
              <div className={styles.addColumnHeader}>
                <button
                  className={styles.addColumnButton}
                  onClick={handleAddColumn}
                  type="button"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* 表格内容 */}
          <div className={styles.tbody}>
            {storeRows.map((row, rowIndex) => (
              <Row
                key={row.id}
                row={row}
                rowIndex={rowIndex + 1} // Use index + 1 for row numbers
                columns={storeColumns}
                columnOrder={visibleColumnOrder}
                columnWidths={columnWidths}
                pluginManager={pluginManager}
                selectedCell={selectedCell}
                editingCell={editingCell}
                onCellSelect={selectCell}
                onCellDoubleClick={handleCellDoubleClick}
                onStartEditing={startEditing}
                onStopEditing={stopEditing}
                onCellChange={handleCellChange}
                onColumnChange={onColumnChange}
                moveRow={handleMoveRow}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 底部控制按钮 */}
      <div className={styles.tableControls}>
        <button
          className={styles.addRowButton}
          onClick={handleAddRow}
          type="button"
        >
          + 添加行
        </button>
      </div>

      {/* 列编辑弹窗 */}
      {columnEditOpen && (
        <ColumnEditModal
          open={columnEditOpen}
          column={editingColumn}
          onCancel={() => setColumnEditOpen(false)}
          onSave={handleSaveColumn}
        />
      )}
    </>
  );
};

export default TableContent;
