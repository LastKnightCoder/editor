import type Database from "better-sqlite3";
import { fallbackCommandContext, type CommandContext } from "@tau/rpc";
import type {
  ColumnDef,
  DataTable,
  DataTableSource,
  DataTableSourceKind,
  DataTableSourceScope,
  RowData,
} from "@tau/shared/database-types";
import type { ApplyDataTableChanges } from "@/types";
import {
  DATA_SOURCES,
  normalizeSourceFields,
  sourceDef,
  requireSourceDef,
  sourceEntityId,
  sourceRowId,
} from "@/features/databases/data-sources";
import { dataSource, type SourceScopeOptions } from "../data-sources";
import {
  collectTags,
  fieldsFromColumns,
  mergeRows,
  sourceColumns,
  splitChanges,
  storedRows,
  tagNameMap,
} from "../data-sources/merge";
import Operation from "./operation";
import DataTableViewTable from "./data-table-view";

interface SourceRecord {
  tableId: number;
  kind: DataTableSourceKind;
  scope: DataTableSourceScope;
  fields: string[];
}

export interface CreateSourceInput {
  kind: DataTableSourceKind;
  scope?: DataTableSourceScope;
  fields?: string[];
}

function parseJson<T>(raw: unknown, fallback: T): T {
  try {
    return typeof raw === "string" ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** 范围只收认得的键，防止渲染端带入任意结构 */
function cleanScope(
  kind: DataTableSourceKind,
  scope: DataTableSourceScope = {}
): DataTableSourceScope {
  if (kind === "document")
    return {
      projectId: Number.isSafeInteger(scope.projectId) ? scope.projectId : undefined,
      deep: Boolean(scope.deep),
    };
  if (kind === "diary")
    return { range: scope.range === "year" || scope.range === "all" ? scope.range : "month" };
  return { tags: (scope.tags ?? []).filter(tag => typeof tag === "string" && tag) };
}

function assertSourceCurrent(source: SourceRecord, expected?: DataTableSource) {
  if (
    expected &&
    (expected.kind !== source.kind ||
      JSON.stringify(cleanScope(expected.kind, expected.scope)) !== JSON.stringify(source.scope) ||
      JSON.stringify(expected.fields) !== JSON.stringify(source.fields))
  ) {
    throw new Error("数据源范围或字段已更新，请刷新后重试");
  }
}

/**
 * 关联数据源的数据表：data_table_sources 记录源与范围，读取时把源头行合并进表，
 * 写入时把改动拆成写回源头与写自建列（data_tables.rows 只存自建列的值）。
 */
export default class DataTableSourceTable {
  static getListenEvents() {
    return {
      "data-table-source:catalog": this.catalog.bind(this),
      "data-table-source:preview": this.preview.bind(this),
      "data-table-source:update": this.updateSource.bind(this),
    };
  }

  static get(db: Database.Database, tableId: number): SourceRecord | null {
    const row = db.prepare("SELECT * FROM data_table_sources WHERE table_id = ?").get(tableId) as
      | Record<string, unknown>
      | undefined;
    if (!row || !sourceDef(String(row.kind))) return null;
    const kind = row.kind as DataTableSourceKind;
    return {
      tableId,
      kind,
      scope: cleanScope(kind, parseJson(row.scope, {})),
      fields: parseJson<string[]>(row.fields, []),
    };
  }

  /** 新建弹窗：各源的范围候选与范围内条数 */
  static catalog(db: Database.Database): {
    kind: DataTableSourceKind;
    options: SourceScopeOptions;
  }[] {
    return DATA_SOURCES.map(def => ({
      kind: def.kind,
      options: dataSource(def.kind).scopeOptions(db),
    }));
  }

  /** 新建弹窗右侧预览：按当前范围与字段合并出的前几行 */
  static preview(
    db: Database.Database,
    input: CreateSourceInput & { limit?: number }
  ): { columns: ColumnDef[]; rows: RowData[]; total: number } {
    const def = sourceDef(input.kind);
    if (!def) throw new Error(`不支持的数据源：${input.kind}`);
    const scope = cleanScope(def.kind, input.scope);
    const all = dataSource(def.kind).list(db, scope);
    const columns = sourceColumns(def, input.fields ?? [], [], collectTags(all));
    const limit = Math.min(Math.max(input.limit ?? 8, 1), 50);
    return { columns, rows: mergeRows(def, all.slice(0, limit), [], columns), total: all.length };
  }

  /** 新建关联表时的初始列（与 database-item:create 同一事务写入） */
  static initialColumns(db: Database.Database, input: CreateSourceInput): ColumnDef[] {
    const def = sourceDef(input.kind);
    if (!def) throw new Error(`不支持的数据源：${input.kind}`);
    const scope = cleanScope(def.kind, input.scope);
    return sourceColumns(
      def,
      input.fields ?? [],
      [],
      collectTags(dataSource(def.kind).list(db, scope))
    );
  }

  static attach(db: Database.Database, tableId: number, input: CreateSourceInput) {
    const def = sourceDef(input.kind);
    if (!def) throw new Error(`不支持的数据源：${input.kind}`);
    const scope = cleanScope(def.kind, input.scope);
    if (def.kind === "document" && !scope.projectId) throw new Error("请选择一个项目");
    const now = Date.now();
    db.prepare(
      `INSERT INTO data_table_sources (table_id, kind, scope, fields, create_time, update_time)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      tableId,
      def.kind,
      JSON.stringify(scope),
      JSON.stringify(normalizeSourceFields(def, input.fields ?? [])),
      now,
      now
    );
  }

  static detach(db: Database.Database, tableId: number) {
    db.prepare("DELETE FROM data_table_sources WHERE table_id = ?").run(tableId);
  }

  /** 列表卡片的行数：范围内的源头条数 */
  static rowCount(db: Database.Database, tableId: number): number | null {
    const source = this.get(db, tableId);
    return source ? dataSource(source.kind).ids(db, source.scope).length : null;
  }

  private static info(source: SourceRecord): DataTableSource {
    return {
      kind: source.kind,
      scope: source.scope,
      fields: source.fields,
      canCreate: requireSourceDef(source.kind).canCreate,
    };
  }

  /**
   * 打开表时，宿主负责持久化清理后的行并同步正文引用；移出范围的行仍保留。
   */
  static merge(
    db: Database.Database,
    table: DataTable,
    cleanRows?: (rows: RowData[]) => void
  ): DataTable {
    const source = this.get(db, table.id);
    if (!source) return table;
    const def = requireSourceDef(source.kind);
    const definition = dataSource(source.kind);
    const sourceRows = definition.list(db, source.scope);
    const columns = sourceColumns(def, source.fields, table.columns, collectTags(sourceRows));
    const stored = cleanRows ? this.keepExisting(db, table.rows, source.kind) : table.rows;
    if (stored !== table.rows) cleanRows?.(stored);
    return {
      ...table,
      columns,
      rows: mergeRows(def, sourceRows, stored, columns),
      source: this.info(source),
    };
  }

  private static keepExisting(db: Database.Database, rows: RowData[], kind: DataTableSourceKind) {
    if (!rows.length) return rows;
    const ids = rows.map(row => sourceEntityId(kind, row.id));
    const existing = dataSource(kind).existing(
      db,
      ids.filter(id => id !== null)
    );
    const kept = rows.filter((_, index) => {
      const id = ids[index];
      return id !== null && existing.has(id);
    });
    return kept.length === rows.length ? rows : kept;
  }

  /**
   * 关联表的一次改动（调用方已开事务）：拆分后先写回源头（含新建、删除），返回要落库的
   * 列与自建列值，以及事务提交后要执行的协作标题发布。落库、正文引用与视图同步由调用方完成。
   */
  static applyChanges(
    db: Database.Database,
    table: DataTable,
    request: Pick<ApplyDataTableChanges, "rows" | "columns" | "expectedSource">,
    ctx: CommandContext = fallbackCommandContext
  ): { columns: ColumnDef[]; rows: RowData[]; publish: (() => void)[] } | null {
    const source = this.get(db, table.id);
    if (!source) return null;
    const def = requireSourceDef(source.kind);
    const definition = dataSource(source.kind);
    assertSourceCurrent(source, request.expectedSource);
    const sourceRows = definition.list(db, source.scope);
    const visible = new Set(sourceRows.map(row => sourceRowId(source.kind, row.id)));
    const inserted = new Set(request.rows.inserted);
    if (
      request.rows.remove.some(id => !visible.has(id)) ||
      request.rows.upsert.some(row => !inserted.has(row.id) && !visible.has(row.id))
    ) {
      throw new Error("条目已删除或已移出当前范围，请刷新后重试");
    }
    const tags = collectTags(sourceRows);
    const previous = sourceColumns(def, source.fields, table.columns, tags);
    const columns = request.columns
      ? sourceColumns(def, fieldsFromColumns(def, request.columns), request.columns, tags)
      : previous;
    const split = splitChanges({
      def,
      columns,
      stored: table.rows,
      upsert: request.rows.upsert,
      remove: request.rows.remove,
      inserted: request.rows.inserted ?? [],
      tagNames: tagNameMap(request.columns ?? previous),
    });

    // 写入提交后再通知源头页面，回滚时丢弃整批通知。
    const publish: (() => void)[] = [];
    const afterCommit: CommandContext["broadcastAll"] = (channel, ...args) => {
      publish.push(() => ctx.broadcastAll(channel, ...args));
    };
    const all: CommandContext = { broadcastOthers: afterCommit, broadcastAll: afterCommit };
    for (const id of split.removes) definition.remove(db, id, all);
    for (const { entityId, patch } of split.writes) {
      const done = definition.write?.(db, entityId, patch, all);
      if (done) publish.push(done);
    }
    const stored = split.stored;
    for (const create of split.creates) {
      if (!definition.create) throw new Error(`${def.label}不支持在表里新建`);
      const entityId = definition.create(db, source.scope, all);
      if (Object.keys(create.patch).length) {
        const done = definition.write?.(db, entityId, create.patch, all);
        if (done) publish.push(done);
      }
      if (Object.keys(create.own).length)
        stored.push({ id: sourceRowId(def.kind, entityId), ...create.own });
    }

    const fields = fieldsFromColumns(def, columns);
    if (fields.join(",") !== source.fields.join(","))
      db.prepare(
        "UPDATE data_table_sources SET fields = ?, update_time = ? WHERE table_id = ?"
      ).run(JSON.stringify(fields), Date.now(), table.id);
    return { columns, rows: storedRows(def, stored, columns), publish };
  }

  /** 调整范围与字段：只改关联记录与源头列，自建列与其值不动 */
  static updateSource(
    db: Database.Database,
    input: {
      tableId: number;
      scope?: DataTableSourceScope;
      fields?: string[];
      expectedSource?: DataTableSource;
    }
  ) {
    return db.transaction(() => {
      const source = this.get(db, input.tableId);
      if (!source) throw new Error("这张表没有关联数据源");
      assertSourceCurrent(source, input.expectedSource);
      const def = requireSourceDef(source.kind);
      const scope = input.scope ? cleanScope(source.kind, input.scope) : source.scope;
      if (def.kind === "document" && !scope.projectId) throw new Error("请选择一个项目");
      const fields = normalizeSourceFields(def, input.fields ?? source.fields);
      const now = Date.now();
      db.prepare(
        "UPDATE data_table_sources SET scope = ?, fields = ?, update_time = ? WHERE table_id = ?"
      ).run(JSON.stringify(scope), JSON.stringify(fields), now, input.tableId);
      const table = db
        .prepare("SELECT columns FROM data_tables WHERE id = ?")
        .get(input.tableId) as { columns: string } | undefined;
      const stored = parseJson<ColumnDef[]>(table?.columns, []);
      const sourceRows = dataSource(source.kind).list(db, scope);
      const columns = sourceColumns(def, fields, stored, collectTags(sourceRows));
      db.prepare("UPDATE data_tables SET columns = ?, update_time = ? WHERE id = ?").run(
        JSON.stringify(columns),
        now,
        input.tableId
      );
      DataTableViewTable.syncViewsWithTable(
        db,
        input.tableId,
        columns,
        sourceRows.map(row => ({ id: sourceRowId(source.kind, row.id) }))
      );
      Operation.insertOperation(db, "data-table", "update", input.tableId, now);
      return true;
    })();
  }
}
