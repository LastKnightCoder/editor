import type Database from "better-sqlite3";
import {
  isQuerySource,
  readQueryDefinition,
  type QueryColumnType,
  type QueryDefinition,
  type QueryReadPage,
  type QueryReadRequest,
  type QueryRecord,
  type QuerySource,
  type QueryValue,
} from "@tau/shared/query-database";
import type { ColumnDef } from "@tau/shared/database-types";
import PluginDataTable from "./plugin-data";
import PluginReadonlyTable from "./plugin-data-readonly";
import type { PluginDataEntity, PluginReadonlyEntity } from "@/types/plugin-data";
import { basename } from "node:path";
import { readProjectDocuments, readQueryDiary } from "../query-database-sources";
import { asynchronousDatabaseCommand } from "../database-command";
import { fallbackCommandContext, type CommandContext } from "@tau/rpc";
import Operation from "./operation";

const entities: Partial<Record<QuerySource, PluginDataEntity>> = {
  cards: "card",
  articles: "article",
  documents: "document",
  projects: "project",
  whiteboards: "whiteboard",
};
const readonlyEntities: Partial<Record<QuerySource, PluginReadonlyEntity>> = {
  notebooks: "notebook",
  materials: "material",
  chats: "chat-session",
};
const numeric = (value: unknown, name: string) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${name} 无效`);
  return number;
};

export default class DataTableQueryTable {
  static getListenEvents() {
    return {
      "data-table-query:read": asynchronousDatabaseCommand(
        async (db: Database.Database, request: QueryReadRequest) => this.read(db, request)
      ),
      "data-table-query:update": this.update.bind(this),
    };
  }
  static get(db: Database.Database, tableId: number) {
    const record = db
      .prepare("SELECT definition, revision FROM data_table_queries WHERE table_id=?")
      .get(tableId) as { definition: string; revision: number } | undefined;
    return record
      ? {
          definition: readQueryDefinition(JSON.parse(record.definition)),
          revision: record.revision,
        }
      : undefined;
  }
  static attach(db: Database.Database, tableId: number, input: QueryDefinition) {
    const definition = readQueryDefinition(input);
    db.prepare(
      "INSERT INTO data_table_queries(table_id,definition,revision,update_time) VALUES (?,?,1,?)"
    ).run(tableId, JSON.stringify(definition), Date.now());
  }
  static assertWritable(db: Database.Database, tableId: number) {
    if (this.get(db, tableId)) throw new Error("查询数据库只读，请修改查询定义");
  }
  static update(
    db: Database.Database,
    input: { tableId: number; definition: QueryDefinition; expectedRevision: number },
    ctx: CommandContext = fallbackCommandContext
  ) {
    const definition = readQueryDefinition(input.definition);
    const saved = db.transaction(() => {
      const now = Date.now();
      const change = db
        .prepare(
          "UPDATE data_table_queries SET definition=?,revision=revision+1,update_time=? WHERE table_id=? AND revision=? AND EXISTS(SELECT 1 FROM data_tables WHERE id=table_id AND ref_count>0)"
        )
        .run(JSON.stringify(definition), now, input.tableId, input.expectedRevision);
      if (!change.changes) throw new Error("查询定义已被修改或删除，请重新读取后重试");
      db.prepare("UPDATE data_tables SET update_time=? WHERE id=?").run(now, input.tableId);
      Operation.insertOperation(db, "data-table", "update", input.tableId, now);
      return this.get(db, input.tableId);
    })();
    ctx.broadcastAll("query-database:changed", {
      databaseName: basename(db.name),
      tableId: input.tableId,
    });
    return saved;
  }
  static read(
    db: Database.Database,
    request: QueryReadRequest
  ): QueryReadPage | Promise<QueryReadPage> {
    if (!isQuerySource(request?.source)) throw new Error("未知的数据来源");
    if (
      request.cursor !== undefined &&
      (typeof request.cursor !== "string" || request.cursor.length > 8192)
    )
      throw new Error("分页游标无效");
    const options = request.options ?? {};
    if (!options || typeof options !== "object" || Array.isArray(options))
      throw new Error("查询参数无效");
    const entity = entities[request.source];
    const readonlyEntity = readonlyEntities[request.source];
    const scope = { databaseName: basename(db.name) };
    if (request.source === "contents") {
      if (request.cursor) throw new Error("正文读取不使用游标");
      return PluginDataTable.content(db, {
        ...scope,
        contentId: numeric(options.contentId, "contentId"),
        createdAt: numeric(options.createdAt, "createdAt"),
        format: options.format === "nodes" ? "nodes" : "markdown",
      }).then(record => {
        if (!record || (!record.owners.length && !record.pluginOwners.length))
          throw new Error("正文不存在或没有可读取的所属对象");
        return {
          items: [
            {
              id: `${record.contentId}:${record.createdAt}`,
              markdown: record.markdown ?? null,
              nodes: record.nodes ? JSON.parse(JSON.stringify(record.nodes)) : null,
              wordCount: record.wordCount,
            },
          ],
        };
      });
    }
    if (entity || readonlyEntity) {
      const query = {
        limit: 200,
        cursor: request.cursor,
        ...(typeof options.tag === "string" ? { tag: options.tag } : {}),
        ...(typeof options.updatedAfter === "number" ? { updatedAfter: options.updatedAfter } : {}),
        ...(typeof options.createdAfter === "number" ? { createdAfter: options.createdAfter } : {}),
      };
      if (readonlyEntity) {
        const page = PluginReadonlyTable.query(db, { ...scope, entity: readonlyEntity, query });
        return {
          items: page.items.map(item => JSON.parse(JSON.stringify(item)) as QueryRecord),
          cursor: page.cursor,
        };
      }
      if (!entity) throw new Error("数据来源无效");
      const page =
        entity === "document" && options.projectId !== undefined
          ? readProjectDocuments(
              db,
              scope,
              numeric(options.projectId, "项目"),
              options.deep !== false,
              request.cursor ? numeric(request.cursor, "游标") : 0,
              query
            )
          : PluginDataTable.query(db, { ...scope, entity, query });
      return {
        items: page.items.map(
          record =>
            ({
              ...record,
              ...(entity === "article"
                ? {
                    author:
                      (
                        db.prepare("SELECT author FROM articles WHERE id=?").get(record.id) as
                          | { author: string | null }
                          | undefined
                      )?.author ?? "",
                  }
                : {}),
              ...(entity === "document"
                ? {
                    parent:
                      "parent" in record
                        ? String(record.parent)
                        : ((
                            db
                              .prepare(
                                "SELECT group_concat(p.title,' / ') AS title FROM project_item d,json_each(d.parents) j JOIN project_item p ON p.id=j.value WHERE d.id=?"
                              )
                              .get(record.id) as { title: string | null } | undefined
                          )?.title ?? ""),
                  }
                : {}),
              id: `${entity}:${record.id}`,
              contentRef:
                record.contentId && record.contentCreatedAt
                  ? { contentId: record.contentId, createdAt: record.contentCreatedAt }
                  : null,
              source: {
                kind: entity,
                id: String(record.id),
                createdAt: record.createdAt,
                title: record.title,
              },
            }) as QueryRecord
        ),
        cursor: page.cursor,
      };
    }
    if (request.source === "diary") {
      const all = readQueryDiary(db);
      const offset = request.cursor ? numeric(request.cursor, "游标") : 0;
      return {
        items: all.slice(offset, offset + 200),
        ...(offset + 200 < all.length ? { cursor: String(offset + 200) } : {}),
      };
    }
    if (request.source === "tables") {
      const tableId = numeric(options.tableId, "tableId");
      if (this.get(db, tableId)) throw new Error("当前仅支持读取普通数据库");
      const record = db
        .prepare("SELECT columns,rows FROM data_tables WHERE id=? AND ref_count>0")
        .get(tableId) as { columns: string; rows: string } | undefined;
      if (!record) throw new Error("数据库不存在");
      const columns = JSON.parse(record.columns) as ColumnDef[];
      const rows = JSON.parse(record.rows) as QueryRecord[];
      const offset = request.cursor ? numeric(request.cursor, "游标") : 0;
      const typeMap: Record<string, QueryColumnType> = {
        text: "text",
        number: "number",
        checkbox: "boolean",
        date: "date",
        select: "select",
        multiSelect: "multiSelect",
      };
      const readCell = (column: ColumnDef, value: QueryValue): QueryValue => {
        if (column.type === "date" && value && typeof value === "object" && !Array.isArray(value))
          return value.start ?? null;
        if (column.type === "select" || column.type === "multiSelect") {
          const config = column.config as { options?: { id: string; name: string }[] } | undefined;
          const name = (id: QueryValue) =>
            config?.options?.find(option => option.id === id)?.name ?? String(id);
          return Array.isArray(value) ? value.map(name) : value === null ? null : name(value);
        }
        return value;
      };
      return {
        items: rows.slice(offset, offset + 200).map(row => ({
          id: String(row.id),
          ...Object.fromEntries(
            columns.map(column => [column.id, readCell(column, row[column.id] ?? null)])
          ),
        })),
        fields: [
          { key: "id", title: "编号", type: "text" },
          ...columns
            .filter(column => column.id !== "id")
            .map(column => ({
              key: column.id,
              title: column.title,
              type: typeMap[column.type] ?? "json",
            })),
        ],
        ...(offset + 200 < rows.length ? { cursor: String(offset + 200) } : {}),
      };
    }
    throw new Error("待办和日程须通过对应业务查询读取");
  }
}
