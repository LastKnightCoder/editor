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
import type { DatabaseView, FooterSpec, SortRule } from "./types";
import PluginManager from "./PluginManager";
import { emptyQuery, projectDatabase, type DatabaseProjection } from "./core/projection";
import { applyRowChanges, diffRows } from "./core/changes";
import { FORMULA_TYPE } from "./core/formula";

export enum Direction {
  UP = "up",
  DOWN = "down",
  LEFT = "left",
  RIGHT = "right",
}

interface TableState {
  columns: ColumnDef[];
  rows: RowData[];
  views: DatabaseView[];
  viewConfig: TableViewConfig;
  activeViewId: number | null;

  columnWidths: Record<string, number>;

  selectedCell: CellCoord | null;
  editingCell: CellCoord | null;

  query: DatabaseQuery;
  projection: DatabaseProjection;
  lastChange: DatabaseChange | null;
  setQuery(query: Partial<DatabaseQuery>): void;
  /** 外部（source="external"）数据变更会清空撤销/重做栈并以当前数据重建基线 */
  dispatch(command: DatabaseCommand, source?: DatabaseChange["source"]): void;

  /** 撤销历史（含创建时的基线快照），只覆盖行与列数据 */
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
  /** 撤销只恢复行与列数据并产生 source=user 变更（触发宿主保存）；视图配置不回滚 */
  undo: () => void;
  redo: () => void;

  addRow: (row?: Partial<RowData>) => void;
  deleteRow: (rowId: string) => void;
  addColumn: (column: Partial<ColumnDef>) => void;
  deleteColumn: (columnId: string) => void;
  editColumn: (columnId: string, updates: Partial<ColumnDef>) => void; // 编辑列属性

  moveCellSelection: (direction: Direction | string) => void;

  setViewConfig: (config: TableViewConfig) => void;
  setGroupBy: (groupConfig: TableViewConfig["groupBy"]) => void;
  setSorts: (sorts: SortRule[]) => void;
  setFilters: (filters: FilterGroup | null) => void;
  setGalleryConfig: (galleryConfig: TableViewConfig["galleryConfig"]) => void;
  setCalendarConfig: (calendarConfig: TableViewConfig["calendarConfig"]) => void;
  setKanbanConfig: (kanbanConfig: TableViewConfig["kanbanConfig"]) => void;
  /** 设置一列的表尾汇总；传 null 取消 */
  setFooter: (columnId: string, spec: FooterSpec | null) => void;
  setActiveViewId: (viewId: number | null) => void;
}

const cloneFilters = (filters: FilterGroup | null | undefined): FilterGroup | null => {
  return filters ? JSON.parse(JSON.stringify(filters)) : null;
};

/** 撤销历史（含基线快照）的条数上限 */
const HISTORY_LIMIT = 50;

const createSnapshot = (
  state: Pick<TableState, "columns" | "rows"> & {
    viewConfig: Pick<TableViewConfig, "columnOrder" | "rowOrder">;
  }
): TableSnapshot => ({
  columns: JSON.parse(JSON.stringify(state.columns)),
  rows: JSON.parse(JSON.stringify(state.rows)),
  columnOrder: [...state.viewConfig.columnOrder],
  rowOrder: [...state.viewConfig.rowOrder],
});

/**
 * 恢复数据后修补视图 order：去掉已消失的 id，仍存在的 id 保持当前顺序（不抵消之后的拖动）；
 * 恢复出现的 id 插回快照中的位置——紧跟其前方最近的仍存在的邻居，没有邻居则放到最前；快照里也没有的追加末尾。
 */
const reconcileOrder = (order: string[], validIds: string[], snapshotOrder: string[]): string[] => {
  const valid = new Set(validIds);
  const result = order.filter(id => valid.has(id));
  const placed = new Set(result);
  snapshotOrder.forEach((id, index) => {
    if (!valid.has(id) || placed.has(id)) return;
    let anchor = -1;
    for (let i = index - 1; i >= 0 && anchor === -1; i--) anchor = result.indexOf(snapshotOrder[i]);
    result.splice(anchor + 1, 0, id);
    placed.add(id);
  });
  return [...result, ...validIds.filter(id => !placed.has(id))];
};

const sameOrder = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id, index) => id === b[index]);

export const createDatabaseStore = (
  initialColumns: ColumnDef[] = [],
  initialRows: RowData[] = [],
  initialViewConfig?: TableViewConfig,
  initialViews?: DatabaseView[],
  activeViewId?: number,
  plugins = new PluginManager(),
  onRowCleanup?: (row: RowData) => void | Promise<void>
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
    footer: initialViewConfig?.footer ? { ...initialViewConfig.footer } : undefined,
  };

  let confirmedRows = initialRows;
  // 基线快照保证第一次数据修改即可撤销
  const baselineSnapshot = createSnapshot({
    columns: initialColumns,
    rows: initialRows,
    viewConfig,
  });
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
      // 外部数据变更以新数据重建撤销基线，撤销不回滚外部更新
      const externalReset =
        dataChanged && source === "external"
          ? { history: [createSnapshot(next)], historyIndex: 0 }
          : undefined;
      setState({
        ...patch,
        ...(externalReset ?? {}),
        views: next.views,
        projection,
        selectedCell: switchedView ? null : validCell(next.selectedCell),
        editingCell: switchedView ? null : validCell(next.editingCell),
        lastChange:
          dataChanged || viewChanged
            ? {
                source,
                dataChanged,
                viewChanged,
                columnsChanged: next.columns !== before.columns,
                rows: diffRows(before.rows, next.rows),
              }
            : before.lastChange,
      });
    };
    const set = (update: Parameters<typeof setState>[0]) => commit(update);
    const restoreSnapshot = (snapshot: TableSnapshot, historyIndex: number) => {
      commit(
        produce<TableState>(state => {
          // 列宽属视图配置：恢复的列保留当前列宽，缺 width 记录的按快照值补齐
          const currentWidthOf = new Map(
            state.columns.map(column => [column.id, column.width] as const)
          );
          state.columns = snapshot.columns.map(column => ({
            ...column,
            width: currentWidthOf.get(column.id) ?? column.width,
          }));
          state.rows = snapshot.rows;
          const columnWidths = { ...state.columnWidths };
          for (const column of state.columns)
            if (!(column.id in columnWidths)) columnWidths[column.id] = column.width || 200;
          state.columnWidths = columnWidths;
          // 视图 order 只做一致性修补，恢复的行列回到删除前的位置；无变化时不动 viewConfig
          const columnOrder = reconcileOrder(
            state.viewConfig.columnOrder,
            state.columns.map(column => column.id),
            snapshot.columnOrder
          );
          const rowOrder = reconcileOrder(
            state.viewConfig.rowOrder,
            state.rows.map(row => row.id),
            snapshot.rowOrder
          );
          if (
            !sameOrder(columnOrder, state.viewConfig.columnOrder) ||
            !sameOrder(rowOrder, state.viewConfig.rowOrder)
          )
            state.viewConfig = { ...state.viewConfig, columnOrder, rowOrder };
          state.historyIndex = historyIndex;
        }),
        "user"
      );
    };
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
      /** 外部（source="external"）数据变更不进撤销历史：到达时清空撤销/重做栈，以当前数据重建基线。 */
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
                .filter((view): view is DatabaseView => Boolean(view))
                .map((view, order) => ({ ...view, order })),
            }),
            source
          );
          return;
        }
        if (command.type === "column.configure") {
          const target = get().columns.find(column => column.id === command.id);
          // 与当前配置一致时不提交：宿主每次刷新都会推送列配置，提交会把外部变更当真、清空撤销栈
          if (!target || JSON.stringify(target.config) === JSON.stringify(command.config)) return;
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
        if (!changes.upsert.length && !changes.remove.length) return;
        const current = get().rows;
        const next = applyRowChanges(current, changes);
        // 宿主保存后的回写与当前数据一致时不提交，否则每次保存都会把外部变更当真、清空撤销栈
        const effective = diffRows(current, next);
        if (effective.upsert.length || effective.remove.length) commit({ rows: next }, source);
      },

      history: [baselineSnapshot],
      historyIndex: 0,

      updateCellValue: (rowId, columnId, value) => {
        set(
          produce<TableState>(state => {
            const rowIndex = state.rows.findIndex(r => r.id === rowId);
            if (rowIndex !== -1) {
              state.rows[rowIndex][columnId] = value;
            }
          })
        );
        get().commitHistory();
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
        const snapshot = createSnapshot(get());
        setState(state => {
          const history =
            state.historyIndex < state.history.length - 1
              ? state.history.slice(0, state.historyIndex + 1)
              : state.history;
          let next = [...history, snapshot];
          if (next.length > HISTORY_LIMIT) next = next.slice(next.length - HISTORY_LIMIT);
          return { history: next, historyIndex: next.length - 1 };
        });
      },

      undo: () => {
        const { history, historyIndex } = get();
        if (historyIndex <= 0) return;
        restoreSnapshot(history[historyIndex - 1], historyIndex - 1);
      },

      redo: () => {
        const { history, historyIndex } = get();
        if (historyIndex >= history.length - 1) return;
        restoreSnapshot(history[historyIndex + 1], historyIndex + 1);
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

        if (!rowToDelete) return;
        if (onRowCleanup) {
          try {
            Promise.resolve(onRowCleanup(rowToDelete)).catch(error => {
              console.error("清理行关联资源失败:", error);
            });
          } catch (error) {
            console.error("清理行关联资源失败:", error);
          }
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

            // 公式列的值只在投影里派生，存储行不留该列
            if (newColumn.type !== FORMULA_TYPE)
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
            if (state.viewConfig.footer?.[columnId]) {
              delete state.viewConfig.footer[columnId];
              if (!Object.keys(state.viewConfig.footer).length) state.viewConfig.footer = undefined;
            }

            // 从所有行中移除此列
            state.rows.forEach((row: RowData) => {
              delete row[columnId];
            });
          })
        );
        get().commitHistory();
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
        const ids = new Set(rows.map(row => row.id));
        const order = [...new Set([...viewConfig.rowOrder, ...rows.map(row => row.id)])].filter(
          id => ids.has(id) && id !== rowId
        );
        order.splice(order.indexOf(targetId) + (from < to ? 1 : 0), 0, rowId);
        set(state => ({ viewConfig: { ...state.viewConfig, rowOrder: order } }));
      },

      editColumn: (columnId, updates) => {
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
              if (updates.type === FORMULA_TYPE)
                state.rows.forEach((row: RowData) => {
                  delete row[columnId];
                });
            }
          })
        );
        get().commitHistory();
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
              footer: config.footer ? { ...config.footer } : undefined,
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
      setFooter: (columnId, spec) => {
        set(
          produce<TableState>((state: TableState) => {
            const footer = { ...state.viewConfig.footer };
            if (spec) footer[columnId] = { ...spec };
            else delete footer[columnId];
            state.viewConfig.footer = Object.keys(footer).length ? footer : undefined;
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
