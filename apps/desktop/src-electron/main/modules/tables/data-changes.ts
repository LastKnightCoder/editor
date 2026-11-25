import DocumentTaskIdentitiesTable from "./document-task-identities";
import type Database from "better-sqlite3";
import type { DataChangesReadRequest, DataChangesReadPage } from "@tau/plugins/host";

const SOURCES = {
  todo: "SELECT 'todo' AS domain,id AS key,'todo:'||id||':'||create_time AS id FROM todo_item",
  "todo-list": "SELECT 'todo-list' AS domain,id AS key,CAST(id AS TEXT) AS id FROM todo_group",
  event: "SELECT 'event' AS domain,id AS key,id||':'||create_time AS id FROM calendar_event",
  calendar: "SELECT 'calendar' AS domain,id AS key,CAST(id AS TEXT) AS id FROM calendar",
} as const;

/** 身份扫描和变更日志的水位在同一短事务内读取，不加载业务正文。 */
export default class DataChangesTable {
  static read(
    db: Database.Database,
    request: DataChangesReadRequest,
    scope: string
  ): DataChangesReadPage {
    if (db.inTransaction) throw new Error("数据库正在提交，请稍后读取变更");
    if (
      !request ||
      !["snapshot", "changes"].includes(request.phase) ||
      !Array.isArray(request.domains) ||
      !request.domains.length ||
      request.domains.length > 4 ||
      request.domains.some(domain => !Object.hasOwn(SOURCES, domain))
    )
      throw new Error("业务变更范围无效");
    if (
      ![request.afterKey, request.afterSeq, request.limit].every(
        value => Number.isSafeInteger(value) && value >= 0
      ) ||
      request.limit < 1 ||
      request.limit > 100 ||
      (request.through !== undefined &&
        (!Number.isSafeInteger(request.through) || request.through < 0))
    )
      throw new Error("业务变更分页参数无效");
    const todoSource = request.todoSource ?? "todo";
    if (!["todo", "document", "all"].includes(todoSource)) throw new Error("待办来源无效");
    return db.transaction(() => {
      if (todoSource !== "todo" && request.domains.includes("todo"))
        scope = JSON.stringify([scope, DocumentTaskIdentitiesTable.requireReady(db)]);
      const state = db
        .prepare(
          "SELECT protocol_version,pruned_through,retention FROM data_change_state WHERE id='main'"
        )
        .get() as
        | { protocol_version: number; pruned_through: number; retention: number }
        | undefined;
      if (!state) throw new Error("业务变更状态缺失");
      const { head } = db
        .prepare(
          "SELECT MAX(COALESCE((SELECT seq FROM sqlite_sequence WHERE name='data_change_log'),0),COALESCE((SELECT MAX(seq) FROM data_change_log),0)) AS head"
        )
        .get() as { head: number };
      const { oldest } = db.prepare("SELECT MIN(seq) AS oldest FROM data_change_log").get() as {
        oldest: number | null;
      };
      const floor = Math.max(
        state.pruned_through,
        head - state.retention,
        oldest === null ? head : oldest - 1
      );
      if (floor > state.pruned_through) {
        db.prepare("DELETE FROM data_change_log WHERE seq<=?").run(floor);
        db.prepare("UPDATE data_change_state SET pruned_through=? WHERE id='main'").run(floor);
      }
      const through = request.through ?? head;
      let rows: DataChangesReadPage["items"] = [];
      if (request.phase === "snapshot") {
        for (const domain of [...new Set(request.domains)].sort()) {
          if (domain < request.afterDomain || rows.length > request.limit) continue;
          if (domain === "todo" && todoSource !== "todo") {
            const after = domain === request.afterDomain ? request.afterKey : 0;
            const size = request.limit + 1 - rows.length;
            const documents = db
              .prepare(
                `SELECT 'todo' AS domain,(CASE WHEN instr(task_id,'@')>0 OR substr(task_id,1,1)='~' OR instr(task_id,char(10))>0 OR instr(task_id,char(13))>0 OR instr(task_id,char(8232))>0 OR instr(task_id,char(8233))>0 THEN 'document:v2:'||content_id||':'||content_created_at||':'||hex(CAST(task_id AS BLOB)) ELSE 'document:'||content_id||':'||content_created_at||':'||task_id END) AS id,id AS key,'upsert' AS operation FROM document_task_visible_identities WHERE id>? ORDER BY key LIMIT ?`
              )
              .all(
                todoSource === "all" ? Math.floor((after - 1) / 2) : after,
                size
              ) as DataChangesReadPage["items"];
            if (todoSource === "all") {
              const independent = db
                .prepare(
                  "SELECT 'todo' AS domain,'todo:'||id||':'||create_time AS id,id AS key,'upsert' AS operation FROM todo_item WHERE id>? ORDER BY key LIMIT ?"
                )
                .all(Math.floor(after / 2), size) as DataChangesReadPage["items"];
              const combined = [
                ...documents.map(item => ({ ...item, key: item.key! * 2 + 1 })),
                ...independent.map(item => ({ ...item, key: item.key! * 2 })),
              ]
                .filter(item => item.key > after)
                .sort((a, b) => a.key - b.key);
              rows.push(...combined.slice(0, size));
            } else rows.push(...documents);
            continue;
          }
          rows.push(
            ...(db
              .prepare(
                `SELECT domain,id,key,'upsert' AS operation FROM (${SOURCES[domain]}) WHERE key>? ORDER BY key LIMIT ?`
              )
              .all(
                domain === request.afterDomain ? request.afterKey : 0,
                request.limit + 1 - rows.length
              ) as DataChangesReadPage["items"])
          );
        }
      } else {
        rows = db
          .prepare(
            `SELECT domain,entity_id AS id,operation,seq FROM data_change_log WHERE seq>? AND seq<=? AND domain IN (${request.domains.map(() => "?").join(",")}) AND (domain<>'todo' OR ?='all' OR (?='document' AND entity_id LIKE 'document:%') OR (?='todo' AND entity_id LIKE 'todo:%')) ORDER BY seq LIMIT ?`
          )
          .all(
            request.afterSeq,
            through,
            ...request.domains,
            todoSource,
            todoSource,
            todoSource,
            request.limit + 1
          ) as DataChangesReadPage["items"];
      }
      return {
        scope,
        todoSource,
        protocol: state.protocol_version,
        head,
        floor,
        through,
        items: rows.slice(0, request.limit) as DataChangesReadPage["items"],
        hasMore: rows.length > request.limit,
      };
    })();
  }
}
