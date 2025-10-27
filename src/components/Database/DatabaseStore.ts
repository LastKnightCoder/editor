import { create } from "zustand";
import { produce } from "immer";
import { v4 as uuidv4 } from "uuid";
import {
  ColumnDef,
  RowData,
  CellValue,
  TableSnapshot,
  CellCoord,
  TableViewConfig,
  FilterGroup,
} from "./types";
import { DataTableView, SortRule } from "@/types";
import { deleteContent } from "@/commands";

export enum Direction {
  UP = "up",
  DOWN = "down",
  LEFT = "left",
  RIGHT = "right",
}

interface TableState {
  columns: ColumnDef[];
  rows: RowData[];
  views: DataTableView[];
  viewConfig: TableViewConfig;
  activeViewId: number | null;

  columnWidths: Record<string, number>;

  selectedCell: CellCoord | null;
  editingCell: CellCoord | null;

  history: TableSnapshot[];
  historyIndex: number;

  updateCellValue: (rowId: string, columnId: string, value: CellValue) => void;
  resizeColumn: (columnId: string, width: number) => void;
  moveColumn: (fromIndex: number, toIndex: number) => void;
  moveRow: (fromIndex: number, toIndex: number) => void; // 行拖拽排序

  selectCell: (rowId: string, columnId: string) => void;
  startEditing: (rowId: string, columnId: string) => void;
  stopEditing: () => void;
  clearCellSelection: () => void; // 清除单元格选择

  commitHistory: () => void;
  undo: () => void;
  redo: () => void;

  addRow: (row?: Partial<RowData>) => void;
  deleteRow: (rowId: string) => void;
  addColumn: (column: Partial<ColumnDef>) => void;
  deleteColumn: (columnId: string) => void;
  deleteColumnWithCleanup: (
    columnId: string,
    pluginMgr?: import("./PluginManager").PluginManager,
  ) => Promise<void>;
  editColumn: (columnId: string, updates: Partial<ColumnDef>) => void; // 编辑列属性

  moveCellSelection: (direction: Direction | string) => void;

  syncExternalData: (
    columns: ColumnDef[],
    rows: RowData[],
    viewConfig: TableViewConfig,
  ) => void;
  setViewConfig: (config: TableViewConfig) => void;
  setGroupBy: (groupConfig: TableViewConfig["groupBy"]) => void;
  setSorts: (sorts: SortRule[]) => void;
  setFilters: (filters: FilterGroup | null) => void;
  setGalleryConfig: (galleryConfig: TableViewConfig["galleryConfig"]) => void;
}

const cloneFilters = (
  filters: FilterGroup | null | undefined,
): FilterGroup | null => {
  return filters ? JSON.parse(JSON.stringify(filters)) : null;
};

const createSnapshot = (
  state: Pick<TableState, "columns" | "rows" | "viewConfig" | "columnWidths">,
): TableSnapshot => ({
  columns: JSON.parse(JSON.stringify(state.columns)),
  rows: JSON.parse(JSON.stringify(state.rows)),
  viewConfig: {
    columnOrder: [...state.viewConfig.columnOrder],
    rowOrder: [...state.viewConfig.rowOrder],
    groupBy: state.viewConfig.groupBy ?? null,
    sorts: [...state.viewConfig.sorts],
    filters: cloneFilters(state.viewConfig.filters ?? null),
  },
});

export const createDatabaseStore = (
  initialColumns: ColumnDef[] = [],
  initialRows: RowData[] = [],
  initialViewConfig?: TableViewConfig,
  initialViews?: DataTableView[],
  activeViewId?: number,
) => {
  const baseColumnOrder = initialColumns.map((col) => col.id);
  const viewConfig: TableViewConfig = {
    columnOrder: initialViewConfig?.columnOrder?.length
      ? initialViewConfig.columnOrder
      : baseColumnOrder,
    rowOrder: initialViewConfig?.rowOrder?.length
      ? initialViewConfig.rowOrder
      : initialRows.map((row) => row.id),
    groupBy: initialViewConfig?.groupBy ?? null,
    sorts: initialViewConfig?.sorts?.length ? [...initialViewConfig.sorts] : [],
    filters: initialViewConfig?.filters
      ? cloneFilters(initialViewConfig.filters)
      : null,
  };

  return create<TableState>((set, get) => ({
    columns: initialColumns,
    rows: initialRows,
    viewConfig,
    views: initialViews || [],
    activeViewId: activeViewId || null,
    columnWidths: initialColumns.reduce(
      (acc, col) => ({
        ...acc,
        [col.id]: col.width || 200, // 默认宽度
      }),
      {},
    ),

    selectedCell: null,
    editingCell: null,

    history: [],
    historyIndex: -1,

    updateCellValue: (rowId, columnId, value) => {
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

    resizeColumn: (columnId, width) => {
      const { columns } = get();
      set(
        produce<TableState>((state: TableState) => {
          state.columnWidths[columnId] = Math.max(50, width); // 最小宽度
          const columnIndex = columns.findIndex((c) => c.id === columnId);
          if (columnIndex !== -1) {
            state.columns[columnIndex].width = Math.max(50, width);
          }
        }),
      );
    },

    moveColumn: (fromIndex, toIndex) => {
      get().commitHistory();

      set(
        produce<TableState>((state) => {
          const nextOrder = [...state.viewConfig.columnOrder];
          const [movedColumn] = nextOrder.splice(fromIndex, 1);
          nextOrder.splice(toIndex, 0, movedColumn);
          state.viewConfig.columnOrder = nextOrder;
        }),
      );
    },

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

    commitHistory: () => {
      const currentState = get();
      const newSnapshot = createSnapshot(currentState);

      set(
        produce<TableState>((state) => {
          if (state.historyIndex < state.history.length - 1) {
            state.history = state.history.slice(0, state.historyIndex + 1);
          }

          state.history.push(newSnapshot);

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
          produce<TableState>((state) => {
            state.columns = previousSnapshot.columns;
            state.rows = previousSnapshot.rows;
            state.viewConfig = {
              columnOrder: [...previousSnapshot.viewConfig.columnOrder],
              rowOrder: [...previousSnapshot.viewConfig.rowOrder],
              groupBy: previousSnapshot.viewConfig.groupBy ?? null,
              sorts: [...previousSnapshot.viewConfig.sorts],
            };
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
          produce<TableState>((state) => {
            state.columns = nextSnapshot.columns;
            state.rows = nextSnapshot.rows;
            state.viewConfig = {
              columnOrder: [...nextSnapshot.viewConfig.columnOrder],
              rowOrder: [...nextSnapshot.viewConfig.rowOrder],
              groupBy: nextSnapshot.viewConfig.groupBy ?? null,
              sorts: [...nextSnapshot.viewConfig.sorts],
            };
            state.historyIndex++;
          }),
        );
      }
    },

    addRow: (rowData = {}) => {
      const newId = uuidv4();

      set(
        produce<TableState>((state) => {
          const newRow: RowData = {
            id: rowData.id || newId,
            ...rowData,
          };

          state.columns.forEach((column: ColumnDef) => {
            if (!(column.id in newRow)) {
              newRow[column.id] = null;
            }
          });

          state.rows.push(newRow);
          state.viewConfig.rowOrder = [...state.viewConfig.rowOrder, newRow.id];
        }),
      );

      get().commitHistory();
    },

    deleteRow: (rowId) => {
      const { rows } = get();
      const rowToDelete = rows.find((row) => row.id === rowId);

      // 如果行有 detailContentId，需要删除关联的内容
      if (rowToDelete?.detailContentId && rowToDelete.detailContentId > 0) {
        deleteContent(rowToDelete.detailContentId as number);
      }

      set(
        produce<TableState>((state) => {
          state.rows = state.rows.filter((row: RowData) => row.id !== rowId);
          state.viewConfig.rowOrder = state.viewConfig.rowOrder.filter(
            (id) => id !== rowId,
          );
        }),
      );
      get().commitHistory();
    },

    addColumn: (columnData) => {
      const columnId = columnData.id || uuidv4();

      set(
        produce<TableState>((state) => {
          const newColumn: ColumnDef = {
            id: columnId,
            title: columnData.title || "新列",
            type: columnData.type || "text",
            ...columnData,
          };

          state.columns.push(newColumn);
          state.viewConfig.columnOrder = [
            ...state.viewConfig.columnOrder,
            columnId,
          ];
          state.columnWidths[columnId] = columnData.width || 200;

          state.rows.forEach((row: RowData) => {
            row[columnId] = null;
          });
        }),
      );
      get().commitHistory();
    },

    deleteColumn: (columnId) => {
      set(
        produce<TableState>((state) => {
          state.columns = state.columns.filter(
            (col: ColumnDef) => col.id !== columnId,
          );
          state.viewConfig.columnOrder = state.viewConfig.columnOrder.filter(
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

    deleteColumnWithCleanup: async (columnId, pluginMgr) => {
      const { columns, rows } = get();

      const columnToDelete = columns.find((col) => col.id === columnId);
      if (!columnToDelete) return;

      const columnData = rows
        .map((row) => row[columnId])
        .filter((value) => value != null);

      if (pluginMgr && columnToDelete.type) {
        try {
          await pluginMgr.executeColumnCleanup(columnToDelete.type, columnData);
        } catch (error) {
          console.error("插件清理失败:", error);
        }
      }

      get().deleteColumn(columnId);
    },

    moveRow: (fromIndex, toIndex) => {
      get().commitHistory();

      set(
        produce<TableState>((state) => {
          const order = [...state.viewConfig.rowOrder];
          const [moved] = order.splice(fromIndex, 1);
          order.splice(toIndex, 0, moved);
          state.viewConfig.rowOrder = order;
        }),
      );
    },

    editColumn: (columnId, updates) => {
      get().commitHistory();

      set(
        produce<TableState>((state) => {
          const columnIndex = state.columns.findIndex((c) => c.id === columnId);
          if (columnIndex !== -1) {
            state.columns[columnIndex] = {
              ...state.columns[columnIndex],
              ...updates,
            };
            if (typeof updates.width === "number") {
              state.columnWidths[columnId] = Math.max(50, updates.width);
              state.columns[columnIndex].width = Math.max(50, updates.width);
            }
          }
        }),
      );
    },

    moveCellSelection: (direction) => {
      const { selectedCell, rows, viewConfig, editingCell } = get();

      if (!selectedCell || editingCell) return;

      const { rowId, columnId } = selectedCell;

      const rowIndex = rows.findIndex((row) => row.id === rowId);
      const colIndex = viewConfig.columnOrder.findIndex(
        (colId) => colId === columnId,
      );

      if (rowIndex === -1 || colIndex === -1) return;

      let newRowIndex = rowIndex;
      let newColIndex = colIndex;

      switch (direction) {
        case Direction.UP:
          newRowIndex = Math.max(0, rowIndex - 1);
          break;
        case Direction.DOWN:
          newRowIndex = Math.min(rows.length - 1, rowIndex + 1);
          break;
        case Direction.LEFT:
          newColIndex = Math.max(0, colIndex - 1);
          break;
        case Direction.RIGHT:
          newColIndex = Math.min(
            viewConfig.columnOrder.length - 1,
            colIndex + 1,
          );
          break;
      }

      if (newRowIndex === rowIndex && newColIndex === colIndex) return;

      const newRowId = rows[newRowIndex].id;
      const newColumnId = viewConfig.columnOrder[newColIndex];

      set({ selectedCell: { rowId: newRowId, columnId: newColumnId } });
    },

    syncExternalData: (columns, rows, incomingViewConfig) => {
      const {
        columns: currentColumns,
        rows: currentRows,
        viewConfig: currentConfig,
      } = get();

      const columnsChanged =
        JSON.stringify(columns) !== JSON.stringify(currentColumns);
      const rowsChanged = JSON.stringify(rows) !== JSON.stringify(currentRows);
      const viewConfigChanged =
        JSON.stringify(incomingViewConfig) !== JSON.stringify(currentConfig);

      if (columnsChanged || rowsChanged || viewConfigChanged) {
        set(
          produce<TableState>((state: TableState) => {
            if (columnsChanged) {
              const newColumnWidths: Record<string, number> = {};
              columns.forEach((col: ColumnDef) => {
                newColumnWidths[col.id] =
                  state.columnWidths[col.id] || col.width || 200;
              });
              state.columnWidths = newColumnWidths;
              state.columns = columns;
            }

            if (rowsChanged) {
              state.rows = rows;
            }

            if (viewConfigChanged) {
              state.viewConfig = {
                columnOrder: [...incomingViewConfig.columnOrder],
                rowOrder: [...incomingViewConfig.rowOrder],
                groupBy: incomingViewConfig.groupBy ?? null,
                sorts: [...(incomingViewConfig.sorts ?? [])],
                filters: cloneFilters(incomingViewConfig.filters ?? null),
              };
            }
          }),
        );
      }
    },

    setViewConfig: (config) => {
      set(
        produce<TableState>((state: TableState) => {
          state.viewConfig = {
            columnOrder: [...config.columnOrder],
            rowOrder: [...config.rowOrder],
            groupBy: config.groupBy ?? null,
            sorts: [...config.sorts],
            filters: cloneFilters(config.filters ?? null),
          };
        }),
      );
    },
    setGroupBy: (groupConfig) => {
      set(
        produce<TableState>((state: TableState) => {
          state.viewConfig.groupBy = groupConfig ?? null;
        }),
      );
    },
    setSorts: (sorts) => {
      set(
        produce<TableState>((state: TableState) => {
          state.viewConfig.sorts = [...sorts];
        }),
      );
    },
    setFilters: (filters) => {
      set(
        produce<TableState>((state: TableState) => {
          state.viewConfig.filters = cloneFilters(filters);
        }),
      );
    },
    setGalleryConfig: (galleryConfig) => {
      set(
        produce<TableState>((state: TableState) => {
          state.viewConfig.galleryConfig = galleryConfig
            ? { ...galleryConfig }
            : undefined;
        }),
      );
    },
  }));
};

export default createDatabaseStore;
