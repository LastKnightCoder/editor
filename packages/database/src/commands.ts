import type PluginManager from "./PluginManager";
import type { DatabaseStoreType } from "./DatabaseContext";
import type { CellValue, ColumnDef, RowData } from "./types";

/**
 * 受控表格 API（D-130）：扩展命令经此读取与提交，不暴露 store。
 * getColumns / getRows 返回浅拷贝副本（store 行不含公式派生值）；写入产生 user 变更触发宿主保存。
 */
export interface DatabaseCommandApi {
  readonly readonly: boolean;
  getColumns(): readonly ColumnDef[];
  getRows(): readonly RowData[];
  getRow(id: string): RowData | undefined;
  /** 当前投影顺序（筛选排序后）的行 id */
  getVisibleRowIds(): readonly string[];
  /** 批量修改单元格，只产生一次撤销步 */
  updateCells(patches: readonly { rowId: string; columnId: string; value: CellValue }[]): void;
  addRow(data?: Partial<RowData>): void;
  /** 批量删除行，只产生一次撤销步 */
  deleteRows(ids: readonly string[]): void;
}

/** 命令执行上下文：rowId / columnId 按 placement 给出（行命令带 rowId、列命令带 columnId） */
export interface CommandContext {
  api: DatabaseCommandApi;
  rowId?: string;
  columnId?: string;
}

export interface DatabaseCommandDefinition {
  /** 必须带命名空间（含 "."） */
  id: string;
  label: string;
  danger?: boolean;
  /** 出现位置；toolbar 当前没有现成的溢出菜单承载，暂不渲染 */
  placement: "row" | "column" | "toolbar";
  when?(ctx: CommandContext): boolean;
  run(ctx: CommandContext): void | Promise<void>;
}

/** 每个 Database 实例一份：受控 API 与装配后的命令定义 */
export interface DatabaseCommandsRuntime {
  readonly api: DatabaseCommandApi;
  readonly definitions: readonly DatabaseCommandDefinition[];
}

/** 按 placement 与 when 过滤出当前可见的命令；when 抛错按隐藏处理 */
export function visibleCommands(
  definitions: readonly DatabaseCommandDefinition[],
  placement: DatabaseCommandDefinition["placement"],
  ctx: CommandContext
): DatabaseCommandDefinition[] {
  return definitions.filter(definition => {
    if (definition.placement !== placement) return false;
    try {
      return definition.when?.(ctx) ?? true;
    } catch {
      return false;
    }
  });
}

/** readonly 由实例 prop 决定，经 getter 读取以跟随 prop 变化 */
export function createCommandApi(
  store: DatabaseStoreType,
  pluginManager: PluginManager,
  getReadonly: () => boolean
): DatabaseCommandApi {
  return {
    get readonly() {
      return getReadonly();
    },
    getColumns() {
      return store.getState().columns.map(column => ({ ...column }));
    },
    getRows() {
      return store.getState().rows.map(row => ({ ...row }));
    },
    getRow(id) {
      const row = store.getState().rows.find(row => row.id === id);
      return row ? { ...row } : undefined;
    },
    getVisibleRowIds() {
      return [...store.getState().projection.rowIds];
    },
    updateCells(patches) {
      if (getReadonly() || patches.length === 0) return;
      const { columns } = store.getState();
      store.getState().updateCells(
        patches.map(({ rowId, columnId, value }) => {
          const column = columns.find(column => column.id === columnId);
          return {
            rowId,
            columnId,
            value: column
              ? pluginManager.transformBeforeSave(column.type, value, column.config)
              : value,
          };
        })
      );
    },
    addRow(data) {
      if (getReadonly()) return;
      store.getState().addRow(data);
    },
    deleteRows(ids) {
      if (getReadonly() || ids.length === 0) return;
      store.getState().deleteRows(ids);
    },
  };
}
