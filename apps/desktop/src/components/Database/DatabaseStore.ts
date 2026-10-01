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
  DatabaseQuery,
  DatabaseCommand,
  DatabaseChange,
} from "./types";
import { DataTableView, SortRule } from "@/types";
import { deleteContent } from "@/commands";
import PluginManager from "./PluginManager";
import { emptyQuery, projectDatabase, type DatabaseProjection } from "./core/projection";
import { applyRowChanges, diffRows } from "./core/changes";

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

  query: DatabaseQuery;
  projection: DatabaseProjection;
  lastChange: DatabaseChange | null;
  setQuery(query: Partial<DatabaseQuery>): void;
  dispatch(command: DatabaseCommand, source?: DatabaseChange["source"]): void;

  history: TableSnapshot[];
  historyIndex: number;

  updateCellValue: (rowId: string, columnId: string, value: CellValue) => void;
  resizeColumn: (columnId: string, width: number) => void;
  moveColumn: (columnId: string, targetId: string) => void;
  moveRow: (rowId: string, targetId: string) => void;

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
    pluginMgr?: import("./PluginManager").PluginManager
  ) => Promise<void>;
  editColumn: (columnId: string, updates: Partial<ColumnDef>) => void; // 编辑列属性

  moveCellSelection: (direction: Direction | string) => void;

  setViewConfig: (config: TableViewConfig) => void;
  setGroupBy: (groupConfig: TableViewConfig["groupBy"]) => void;
  setSorts: (sorts: SortRule[]) => void;
  setFilters: (filters: FilterGroup | null) => void;
  setGalleryConfig: (galleryConfig: TableViewConfig["galleryConfig"]) => void;
  setCalendarConfig: (calendarConfig: TableViewConfig["calendarConfig"]) => void;
  setKanbanConfig: (kanbanConfig: TableViewConfig["kanbanConfig"]) => void;
  setActiveViewId: (viewId: number | null) => void;
}

const cloneFilters = (filters: FilterGroup | null | undefined): FilterGroup | null => {
  return filters ? JSON.parse(JSON.stringify(filters)) : null;
};

const createSnapshot = (
  state: Pick<TableState, "columns" | "rows" | "viewConfig" | "columnWidths">
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
  plugins = new PluginManager()
) => {
  const baseColumnOrder = initialColumns.map(col => col.id);

  // 从 viewConfig 读取已保存的列宽，或使用列定义的默认宽度
  const savedColumnWidths = initialViewConfig?.columnWidths || {};
  const mergedColumnWidths = initialColumns.reduce(
    (acc, col) => ({
      ...acc,
      [col.id]: savedColumnWidths[col.id] || col.width || 200,
    }),
    {} as Record<string, number>
  );

  const viewConfig: TableViewConfig = {
    columnOrder: initialViewConfig?.columnOrder?.length
      ? initialViewConfig.columnOrder
      : baseColumnOrder,
    rowOrder: initialViewConfig?.rowOrder?.length
      ? initialViewConfig.rowOrder
      : initialRows.map(row => row.id),
    columnWidths: mergedColumnWidths,
    groupBy: initialViewConfig?.groupBy ?? null,
    sorts: initialViewConfig?.sorts?.length ? [...initialViewConfig.sorts] : [],
    filters: initialViewConfig?.filters ? cloneFilters(initialViewConfig.filters) : null,
    // 复制画廊、日历、看板配置
    galleryConfig: initialViewConfig?.galleryConfig
      ? { ...initialViewConfig.galleryConfig }
      : undefined,
    calendarConfig: initialViewConfig?.calendarConfig
      ? { ...initialViewConfig.calendarConfig }
      : undefined,
    kanbanConfig: initialViewConfig?.kanbanConfig
      ? { ...initialViewConfig.kanbanConfig }
      : undefined,
  };

  let confirmedRows = initialRows;
  return create<TableState>((setState, get) => {
    const commit = (
      update: Parameters<typeof setState>[0],
      source: DatabaseChange["source"] = "user"
    ) => {
      const before = get();
      const patch = typeof update === "function" ? update(before) : update;
      const next = { ...before, ...patch };
      const dataChanged = next.rows !== before.rows || next.columns !== before.columns;
      const viewChanged = next.viewConfig !== before.viewConfig;
      if (viewChanged)
        next.views = next.views.map(view =>
          view.id === next.activeViewId ? { ...view, config: next.viewConfig } : view
        );
      const viewType = next.views.find(view => view.id === next.activeViewId)?.type;
      const previousViewType = before.views.find(view => view.id === before.activeViewId)?.type;
      const switchedView =
        next.activeViewId !== before.activeViewId || viewType !== previousViewType;
      const projection =
        dataChanged || viewChanged || next.query !== before.query || switchedView
          ? projectDatabase(next.rows, next.columns, next.viewConfig, next.query, plugins, viewType)
          : before.projection;
      const validCell = (cell: CellCoord | null) =>
        cell &&
        projection.rowIds.includes(cell.rowId) &&
        projection.columnIds.includes(cell.columnId)
          ? cell
          : null;
      setState({
        ...patch,
        views: next.views,
        projection,
        selectedCell: switchedView ? null : validCell(next.selectedCell),
        editingCell: switchedView ? null : validCell(next.editingCell),
        lastChange:
          dataChanged || viewChanged
            ? { source, dataChanged, viewChanged, rows: diffRows(before.rows, next.rows) }
            : before.lastChange,
      });
    };
    const set = (update: Parameters<typeof setState>[0]) => commit(update);
    return {
      columns: initialColumns,
      rows: initialRows,
      viewConfig,
      views: initialViews || [],
      activeViewId: activeViewId || null,
      columnWidths: mergedColumnWidths,

      selectedCell: null,
      editingCell: null,

      query: emptyQuery,
      projection: projectDatabase(
        initialRows,
        initialColumns,
        viewConfig,
        emptyQuery,
        plugins,
        initialViews?.find(view => view.id === activeViewId)?.type
      ),
      lastChange: null,
      setQuery: query => set(state => ({ query: { ...state.query, ...query } })),
      dispatch: (command, source = "user") => {
        if (command.type === "view.receive") {
          commit(state => {
            const views = state.views.some(view => view.id === command.view.id)
              ? state.views.map(view => (view.id === command.view.id ? command.view : view))
              : [...state.views, command.view];
            const activeViewId = command.activate ? command.view.id : state.activeViewId;
            return {
              views,
              activeViewId,
              viewConfig: activeViewId === command.view.id ? command.view.config : state.viewConfig,
            };
          }, source);
          return;
        }
        if (command.type === "view.remove") {
          commit(state => {
            const views = state.views.filter(view => view.id !== command.id);
            const activeViewId =
              state.activeViewId === command.id ? (views[0]?.id ?? null) : state.activeViewId;
            return {
              views,
              activeViewId,
              viewConfig: views.find(view => view.id === activeViewId)?.config ?? state.viewConfig,
            };
          }, source);
          return;
        }
        if (command.type === "views.reorder") {
          commit(
            state => ({
              views: [...new Set([...command.ids, ...state.views.map(view => view.id)])]
                .map(id => state.views.find(view => view.id === id))
                .filter((view): view is DataTableView => Boolean(view))
                .map((view, order) => ({ ...view, order })),
            }),
            source
          );
          return;
        }
        if (command.type === "column.configure") {
          commit(
            state => ({
              columns: state.columns.map(column =>
                column.id === command.id ? { ...column, config: command.config } : column
              ),
            }),
            source
          );
          return;
        }
        if (command.type === "column.resize") {
          if (
            !Number.isFinite(command.width) ||
            !get().columns.some(column => column.id === command.id)
          )
            return;
          const width = Math.max(50, command.width);
          if (get().columnWidths[command.id] === width) return;
          commit(
            state => ({
              columns: state.columns.map(column =>
                column.id === command.id ? { ...column, width } : column
              ),
              columnWidths: { ...state.columnWidths, [command.id]: width },
              viewConfig: {
                ...state.viewConfig,
                columnWidths: { ...state.viewConfig.columnWidths, [command.id]: width },
              },
            }),
            source
          );
          return;
        }
        const changes =
          command.type === "rows.receive" ? diffRows(confirmedRows, command.rows) : command.changes;
        if (command.type === "rows.receive") confirmedRows = command.rows;
        else if (source === "external") confirmedRows = applyRowChanges(confirmedRows, changes);
        if (changes.upsert.length || changes.remove.length)
          commit(state => ({ rows: applyRowChanges(state.rows, changes) }), source);
      },

      history: [],
      historyIndex: -1,

      updateCellValue: (rowId, columnId, value) => {
        get().commitHistory();

        set(
          produce<TableState>(state => {
            const rowIndex = state.rows.findIndex(r => r.id === rowId);
            if (rowIndex !== -1) {
              state.rows[rowIndex][columnId] = value;
            }
          })
        );
      },

      resizeColumn: (columnId, width) => {
        const { columns } = get();
        set(
          produce<TableState>((state: TableState) => {
            const newWidth = Math.max(50, width);
            state.columnWidths[columnId] = newWidth;
            // 同时更新 viewConfig.columnWidths 以便持久化
            if (!state.viewConfig.columnWidths) {
              state.viewConfig.columnWidths = {};
            }
            state.viewConfig.columnWidths[columnId] = newWidth;
            const columnIndex = columns.findIndex(c => c.id === columnId);
            if (columnIndex !== -1) {
              state.columns[columnIndex].width = newWidth;
            }
          })
        );
      },

      moveColumn: (columnId, targetId) => {
        const { viewConfig, columns } = get();
        const order = [
          ...new Set([...viewConfig.columnOrder, ...columns.map(column => column.id)]),
        ];
        const fromIndex = order.indexOf(columnId);
        const toIndex = order.indexOf(targetId);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
        get().commitHistory();

        set(
          produce<TableState>(state => {
            const nextOrder = [...order];
            const [movedColumn] = nextOrder.splice(fromIndex, 1);
            nextOrder.splice(toIndex, 0, movedColumn);
            state.viewConfig.columnOrder = nextOrder;
          })
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
          produce<TableState>(state => {
            if (state.historyIndex < state.history.length - 1) {
              state.history = state.history.slice(0, state.historyIndex + 1);
            }

            state.history.push(newSnapshot);

            if (state.history.length > 50) {
              state.history = state.history.slice(state.history.length - 50);
            }

            state.historyIndex = state.history.length - 1;
          })
        );
      },

      undo: () => {
        const { historyIndex, history } = get();

        if (historyIndex > 0) {
          const previousSnapshot = history[historyIndex - 1];
          set(
            produce<TableState>(state => {
              state.columns = previousSnapshot.columns;
              state.rows = previousSnapshot.rows;
              state.viewConfig = {
                columnOrder: [...previousSnapshot.viewConfig.columnOrder],
                rowOrder: [...previousSnapshot.viewConfig.rowOrder],
                groupBy: previousSnapshot.viewConfig.groupBy ?? null,
                sorts: [...previousSnapshot.viewConfig.sorts],
              };
              state.historyIndex--;
            })
          );
        }
      },

      redo: () => {
        const { historyIndex, history } = get();

        if (historyIndex < history.length - 1) {
          const nextSnapshot = history[historyIndex + 1];
          set(
            produce<TableState>(state => {
              state.columns = nextSnapshot.columns;
              state.rows = nextSnapshot.rows;
              state.viewConfig = {
                columnOrder: [...nextSnapshot.viewConfig.columnOrder],
                rowOrder: [...nextSnapshot.viewConfig.rowOrder],
                groupBy: nextSnapshot.viewConfig.groupBy ?? null,
                sorts: [...nextSnapshot.viewConfig.sorts],
              };
              state.historyIndex++;
            })
          );
        }
      },

      addRow: (rowData = {}) => {
        const newId = uuidv4();

        set(
          produce<TableState>(state => {
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
          })
        );

        get().commitHistory();
      },

      deleteRow: rowId => {
        const { rows } = get();
        const rowToDelete = rows.find(row => row.id === rowId);

        // 如果行有 detailContentId，需要删除关联的内容
        if (rowToDelete?.detailContentId && rowToDelete.detailContentId > 0) {
          deleteContent(rowToDelete.detailContentId as number);
        }

        set(
          produce<TableState>(state => {
            state.rows = state.rows.filter((row: RowData) => row.id !== rowId);
            state.viewConfig.rowOrder = state.viewConfig.rowOrder.filter(id => id !== rowId);
          })
        );
        get().commitHistory();
      },

      addColumn: columnData => {
        const columnId = columnData.id || uuidv4();

        set(
          produce<TableState>(state => {
            const newColumn: ColumnDef = {
              id: columnId,
              title: columnData.title || "新列",
              type: columnData.type || "text",
              ...columnData,
            };

            state.columns.push(newColumn);
            state.viewConfig.columnOrder = [...state.viewConfig.columnOrder, columnId];
            state.columnWidths[columnId] = columnData.width || 200;

            state.rows.forEach((row: RowData) => {
              row[columnId] = null;
            });
          })
        );
        get().commitHistory();
      },

      deleteColumn: columnId => {
        set(
          produce<TableState>(state => {
            state.columns = state.columns.filter((col: ColumnDef) => col.id !== columnId);
            state.viewConfig.columnOrder = state.viewConfig.columnOrder.filter(
              (id: string) => id !== columnId
            );
            delete state.columnWidths[columnId];

            // 从所有行中移除此列
            state.rows.forEach((row: RowData) => {
              delete row[columnId];
            });
          })
        );
        get().commitHistory();
      },

      deleteColumnWithCleanup: async (columnId, pluginMgr) => {
        const { columns, rows } = get();

        const columnToDelete = columns.find(col => col.id === columnId);
        if (!columnToDelete) return;

        const columnData = rows.map(row => row[columnId]).filter(value => value != null);

        if (pluginMgr && columnToDelete.type) {
          try {
            await pluginMgr.executeColumnCleanup(columnToDelete.type, columnData);
          } catch (error) {
            console.error("插件清理失败:", error);
          }
        }

        get().deleteColumn(columnId);
      },

      moveRow: (rowId, targetId) => {
        const { projection, rows, viewConfig } = get();
        if (!projection.canReorder || rowId === targetId) return;
        const from = projection.rowIds.indexOf(rowId);
        const to = projection.rowIds.indexOf(targetId);
        if (from < 0 || to < 0) return;
        if (
          projection.grouped &&
          !projection.groups.some(
            group =>
              group.rows.some(row => row.id === rowId) &&
              group.rows.some(row => row.id === targetId)
          )
        )
          return;
        get().commitHistory();
        const ids = new Set(rows.map(row => row.id));
        const order = [...new Set([...viewConfig.rowOrder, ...rows.map(row => row.id)])].filter(
          id => ids.has(id) && id !== rowId
        );
        order.splice(order.indexOf(targetId) + (from < to ? 1 : 0), 0, rowId);
        set(state => ({ viewConfig: { ...state.viewConfig, rowOrder: order } }));
      },

      editColumn: (columnId, updates) => {
        get().commitHistory();

        set(
          produce<TableState>(state => {
            const columnIndex = state.columns.findIndex(c => c.id === columnId);
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
          })
        );
      },

      moveCellSelection: direction => {
        const { selectedCell, projection, editingCell } = get();

        if (!selectedCell || editingCell) return;

        const { rowId, columnId } = selectedCell;

        const rowIndex = projection.rowIds.indexOf(rowId);
        const colIndex = projection.columnIds.indexOf(columnId);

        if (rowIndex === -1 || colIndex === -1) return;

        let newRowIndex = rowIndex;
        let newColIndex = colIndex;

        switch (direction) {
          case Direction.UP:
            newRowIndex = Math.max(0, rowIndex - 1);
            break;
          case Direction.DOWN:
            newRowIndex = Math.min(projection.rowIds.length - 1, rowIndex + 1);
            break;
          case Direction.LEFT:
            newColIndex = Math.max(0, colIndex - 1);
            break;
          case Direction.RIGHT:
            newColIndex = Math.min(projection.columnIds.length - 1, colIndex + 1);
            break;
        }

        if (newRowIndex === rowIndex && newColIndex === colIndex) return;

        const newRowId = projection.rowIds[newRowIndex];
        const newColumnId = projection.columnIds[newColIndex];

        set({ selectedCell: { rowId: newRowId, columnId: newColumnId } });
      },

      setViewConfig: config => {
        set(
          produce<TableState>((state: TableState) => {
            state.viewConfig = {
              columnOrder: [...config.columnOrder],
              rowOrder: [...config.rowOrder],
              groupBy: config.groupBy ?? null,
              sorts: [...config.sorts],
              filters: cloneFilters(config.filters ?? null),
              galleryConfig: config.galleryConfig ? { ...config.galleryConfig } : undefined,
              calendarConfig: config.calendarConfig ? { ...config.calendarConfig } : undefined,
              kanbanConfig: config.kanbanConfig ? { ...config.kanbanConfig } : undefined,
            };
          })
        );
      },
      setGroupBy: groupConfig => {
        set(
          produce<TableState>((state: TableState) => {
            state.viewConfig.groupBy = groupConfig ?? null;
          })
        );
      },
      setSorts: sorts => {
        set(
          produce<TableState>((state: TableState) => {
            state.viewConfig.sorts = [...sorts];
          })
        );
      },
      setFilters: filters => {
        set(
          produce<TableState>((state: TableState) => {
            state.viewConfig.filters = cloneFilters(filters);
          })
        );
      },
      setGalleryConfig: galleryConfig => {
        set(
          produce<TableState>((state: TableState) => {
            state.viewConfig.galleryConfig = galleryConfig ? { ...galleryConfig } : undefined;
          })
        );
      },
      setCalendarConfig: calendarConfig => {
        set(
          produce<TableState>((state: TableState) => {
            state.viewConfig.calendarConfig = calendarConfig ? { ...calendarConfig } : undefined;
          })
        );
      },
      setKanbanConfig: kanbanConfig => {
        set(
          produce<TableState>((state: TableState) => {
            state.viewConfig.kanbanConfig = kanbanConfig ? { ...kanbanConfig } : undefined;
          })
        );
      },
      setActiveViewId: viewId => {
        const view = get().views.find(view => view.id === viewId);
        if (viewId !== null && !view) return;
        commit({ activeViewId: viewId, viewConfig: view?.config ?? get().viewConfig }, "external");
      },
    };
  });
};

export default createDatabaseStore;
