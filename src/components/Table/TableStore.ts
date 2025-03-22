import { create } from "zustand";
import { produce } from "immer";
import { v4 as uuidv4 } from "uuid";
import {
  ColumnDef,
  RowData,
  CellValue,
  TableSnapshot,
  CellCoord,
} from "./types";

/**
 * 方向枚举
 */
export enum Direction {
  UP = "up",
  DOWN = "down",
  LEFT = "left",
  RIGHT = "right",
}

// 表格状态接口
interface TableState {
  columns: ColumnDef[];
  rows: RowData[];
  columnOrder: string[]; // 列顺序
  columnWidths: Record<string, number>; // 列宽度存储

  // 选择状态
  selectedCell: CellCoord | null;
  editingCell: CellCoord | null;

  // 历史状态（用于撤销/重做）
  history: TableSnapshot[];
  historyIndex: number;

  // 核心操作
  updateCellValue: (rowId: string, columnId: string, value: CellValue) => void;
  resizeColumn: (columnId: string, width: number) => void;
  moveColumn: (fromIndex: number, toIndex: number) => void;
  moveRow: (fromIndex: number, toIndex: number) => void; // 行拖拽排序

  // 选择操作
  selectCell: (rowId: string, columnId: string) => void;
  startEditing: (rowId: string, columnId: string) => void;
  stopEditing: () => void;
  clearCellSelection: () => void; // 清除单元格选择

  // 历史操作
  commitHistory: () => void;
  undo: () => void;
  redo: () => void;

  // CRUD操作
  addRow: (row?: Partial<RowData>) => void;
  deleteRow: (rowId: string) => void;
  addColumn: (column: Partial<ColumnDef>) => void;
  deleteColumn: (columnId: string) => void;
  editColumn: (columnId: string, updates: Partial<ColumnDef>) => void; // 编辑列属性

  // 导航
  moveCellSelection: (direction: Direction | string) => void;

  // 排序
  sortColumn: (columnId: string) => void;

  // 同步外部数据
  syncExternalData: (columns: ColumnDef[], rows: RowData[]) => void;
}

// 创建当前状态的快照
const createSnapshot = (
  state: Pick<TableState, "columns" | "rows" | "columnOrder">,
): TableSnapshot => ({
  columns: JSON.parse(JSON.stringify(state.columns)),
  rows: JSON.parse(JSON.stringify(state.rows)),
  columnOrder: [...state.columnOrder],
});

/**
 * 创建表格存储
 *
 * @param initialColumns 初始列配置
 * @param initialRows 初始行数据
 * @param initColumnOrder 初始列顺序，如果不提供则使用列ID顺序
 * @returns Zustand store对象
 */
export const createTableStore = (
  initialColumns: ColumnDef[] = [],
  initialRows: RowData[] = [],
  initColumnOrder?: string[],
) => {
  // 如果没有提供初始列顺序，则使用列ID顺序
  const columnOrder = initColumnOrder || initialColumns.map((col) => col.id);

  return create<TableState>((set, get) => ({
    // 初始状态
    columns: initialColumns,
    rows: initialRows,
    columnOrder: columnOrder,
    columnWidths: initialColumns.reduce(
      (acc, col) => ({
        ...acc,
        [col.id]: col.width || 200, // 默认宽度
      }),
      {},
    ),

    selectedCell: null,
    editingCell: null,

    // 历史状态（用于撤销/重做）
    history: [],
    historyIndex: -1,

    // 核心操作
    updateCellValue: (rowId, columnId, value) => {
      // Store current state before modification
      get().commitHistory();

      set(
        produce<TableState>((state) => {
          const rowIndex = state.rows.findIndex((r) => r.id === rowId);
          if (rowIndex !== -1) {
            state.rows[rowIndex][columnId] = value;
          }
        }),
      );
    },

    // 列操作
    resizeColumn: (columnId, width) => {
      set(
        produce((state) => {
          state.columnWidths[columnId] = Math.max(50, width); // 最小宽度
        }),
      );
    },

    moveColumn: (fromIndex, toIndex) => {
      // Store current state before modification
      get().commitHistory();

      set(
        produce<TableState>((state) => {
          const columnOrder = [...state.columnOrder];
          const [movedColumn] = columnOrder.splice(fromIndex, 1);
          columnOrder.splice(toIndex, 0, movedColumn);
          state.columnOrder = columnOrder;
        }),
      );
    },

    // 选择操作
    selectCell: (rowId, columnId) => {
      set({ selectedCell: { rowId, columnId }, editingCell: null });
    },

    startEditing: (rowId, columnId) => {
      set({
        selectedCell: { rowId, columnId },
        editingCell: { rowId, columnId },
      });
    },

    stopEditing: () => {
      set({ editingCell: null });
    },

    clearCellSelection: () => {
      set({ selectedCell: null, editingCell: null });
    },

    // 历史操作
    commitHistory: () => {
      const currentState = get();
      const newSnapshot = createSnapshot(currentState);

      set(
        produce((state) => {
          // 如果我们在历史栈中间，需要删除前进历史
          if (state.historyIndex < state.history.length - 1) {
            state.history = state.history.slice(0, state.historyIndex + 1);
          }

          // 添加新快照到历史
          state.history.push(newSnapshot);

          // 限制历史大小
          if (state.history.length > 50) {
            state.history = state.history.slice(state.history.length - 50);
          }

          state.historyIndex = state.history.length - 1;
        }),
      );
    },

    undo: () => {
      const { historyIndex, history } = get();

      if (historyIndex > 0) {
        const previousSnapshot = history[historyIndex - 1];
        set(
          produce((state) => {
            state.columns = previousSnapshot.columns;
            state.rows = previousSnapshot.rows;
            state.columnOrder = previousSnapshot.columnOrder;
            state.historyIndex--;
          }),
        );
      }
    },

    redo: () => {
      const { historyIndex, history } = get();

      if (historyIndex < history.length - 1) {
        const nextSnapshot = history[historyIndex + 1];
        set(
          produce((state) => {
            state.columns = nextSnapshot.columns;
            state.rows = nextSnapshot.rows;
            state.columnOrder = nextSnapshot.columnOrder;
            state.historyIndex++;
          }),
        );
      }
    },

    // CRUD操作
    addRow: (rowData = {}) => {
      const newId = uuidv4();

      set(
        produce((state) => {
          const newRow: RowData = {
            id: rowData.id || newId,
            ...rowData,
          };

          // 初始化缺失的列值
          state.columns.forEach((column: ColumnDef) => {
            if (!(column.id in newRow)) {
              newRow[column.id] = null;
            }
          });

          state.rows.push(newRow);
        }),
      );

      // Commit history after state update
      get().commitHistory();
    },

    deleteRow: (rowId) => {
      set(
        produce((state) => {
          state.rows = state.rows.filter((row: RowData) => row.id !== rowId);
        }),
      );
      get().commitHistory();
    },

    addColumn: (columnData) => {
      const columnId = columnData.id || uuidv4();

      set(
        produce((state) => {
          const newColumn: ColumnDef = {
            id: columnId,
            title: columnData.title || "新列",
            type: columnData.type || "text",
            ...columnData,
          };

          state.columns.push(newColumn);
          state.columnOrder.push(columnId);
          state.columnWidths[columnId] = columnData.width || 200;

          // 为所有现有行初始化此列
          state.rows.forEach((row: RowData) => {
            row[columnId] = null;
          });
        }),
      );
      get().commitHistory();
    },

    deleteColumn: (columnId) => {
      set(
        produce((state) => {
          state.columns = state.columns.filter(
            (col: ColumnDef) => col.id !== columnId,
          );
          state.columnOrder = state.columnOrder.filter(
            (id: string) => id !== columnId,
          );
          delete state.columnWidths[columnId];

          // 从所有行中移除此列
          state.rows.forEach((row: RowData) => {
            delete row[columnId];
          });
        }),
      );
      get().commitHistory();
    },

    // 移动行
    moveRow: (fromIndex, toIndex) => {
      // Store current state before modification
      get().commitHistory();

      set(
        produce<TableState>((state) => {
          const rows = [...state.rows];
          const [movedRow] = rows.splice(fromIndex, 1);
          rows.splice(toIndex, 0, movedRow);
          state.rows = rows;
        }),
      );
    },

    // 编辑列属性
    editColumn: (columnId, updates) => {
      // Store current state before modification
      get().commitHistory();

      set(
        produce<TableState>((state) => {
          const columnIndex = state.columns.findIndex((c) => c.id === columnId);
          if (columnIndex !== -1) {
            state.columns[columnIndex] = {
              ...state.columns[columnIndex],
              ...updates,
            };
          }
        }),
      );
    },

    // 导航
    moveCellSelection: (direction) => {
      const { selectedCell, rows, columnOrder } = get();

      if (!selectedCell) return;

      const { rowId, columnId } = selectedCell;

      // 当前行和列的索引
      const rowIndex = rows.findIndex((row) => row.id === rowId);
      const colIndex = columnOrder.findIndex((colId) => colId === columnId);

      if (rowIndex === -1 || colIndex === -1) return;

      let newRowIndex = rowIndex;
      let newColIndex = colIndex;

      // 根据方向更新索引
      switch (direction) {
        case Direction.UP:
        case "up":
          newRowIndex = Math.max(0, rowIndex - 1);
          break;
        case Direction.DOWN:
        case "down":
          newRowIndex = Math.min(rows.length - 1, rowIndex + 1);
          break;
        case Direction.LEFT:
        case "left":
          newColIndex = Math.max(0, colIndex - 1);
          break;
        case Direction.RIGHT:
        case "right":
          newColIndex = Math.min(columnOrder.length - 1, colIndex + 1);
          break;
      }

      if (newRowIndex === rowIndex && newColIndex === colIndex) return;

      const newRowId = rows[newRowIndex].id;
      const newColumnId = columnOrder[newColIndex];

      set({ selectedCell: { rowId: newRowId, columnId: newColumnId } });
    },

    // 排序
    sortColumn: (columnId) => {
      set(
        produce((state) => {
          // 查找列
          const columnIndex = state.columns.findIndex(
            (col: ColumnDef) => col.id === columnId,
          );
          if (columnIndex === -1) return;

          const column = state.columns[columnIndex];

          // 重置其他列的排序方向
          state.columns.forEach((col: ColumnDef, idx: number) => {
            if (idx !== columnIndex) {
              col.sortDirection = null;
            }
          });

          // 更新排序方向：null -> asc -> desc -> null
          column.sortDirection =
            column.sortDirection === null
              ? "asc"
              : column.sortDirection === "asc"
                ? "desc"
                : null;

          // 如果没有排序方向，不排序
          if (column.sortDirection === null) return;

          // 排序行
          state.rows.sort((a: RowData, b: RowData) => {
            const valueA = a[columnId];
            const valueB = b[columnId];

            // 处理空值
            if (valueA === null || valueA === undefined)
              return column.sortDirection === "asc" ? -1 : 1;
            if (valueB === null || valueB === undefined)
              return column.sortDirection === "asc" ? 1 : -1;

            // 根据类型比较
            if (typeof valueA === "string" && typeof valueB === "string") {
              return column.sortDirection === "asc"
                ? valueA.localeCompare(valueB)
                : valueB.localeCompare(valueA);
            }

            if (typeof valueA === "number" && typeof valueB === "number") {
              return column.sortDirection === "asc"
                ? valueA - valueB
                : valueB - valueA;
            }

            if (valueA instanceof Date && valueB instanceof Date) {
              return column.sortDirection === "asc"
                ? valueA.getTime() - valueB.getTime()
                : valueB.getTime() - valueA.getTime();
            }

            // 默认字符串比较
            return column.sortDirection === "asc"
              ? String(valueA).localeCompare(String(valueB))
              : String(valueB).localeCompare(String(valueA));
          });
        }),
      );
    },

    // 同步外部数据
    syncExternalData: (columns, rows) => {
      // 只在数据实际变化时更新
      const { columns: currentColumns, rows: currentRows } = get();

      const columnsChanged =
        JSON.stringify(columns) !== JSON.stringify(currentColumns);
      const rowsChanged = JSON.stringify(rows) !== JSON.stringify(currentRows);

      if (columnsChanged || rowsChanged) {
        set(
          produce((state) => {
            // 更新列时保留排序方向
            if (columnsChanged) {
              // 保存现有列的排序方向
              const sortDirections: Record<string, "asc" | "desc" | null> = {};
              state.columns.forEach((col: ColumnDef) => {
                if (col.sortDirection) {
                  sortDirections[col.id] = col.sortDirection;
                }
              });

              // 更新列并还原排序方向
              state.columns = columns.map((col: ColumnDef) => ({
                ...col,
                sortDirection: sortDirections[col.id] || null,
              }));

              // 更新列顺序
              state.columnOrder = columns.map((col) => col.id);

              // 更新列宽度
              const newColumnWidths: Record<string, number> = {};
              columns.forEach((col: ColumnDef) => {
                newColumnWidths[col.id] =
                  state.columnWidths[col.id] || col.width || 200;
              });
              state.columnWidths = newColumnWidths;
            }

            // 更新行
            if (rowsChanged) {
              state.rows = rows;
            }
          }),
        );
      }
    },
  }));
};

export default createTableStore;
