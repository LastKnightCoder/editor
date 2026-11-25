import type Database from "better-sqlite3";
import type { DomainEventRecord } from "@/types/domain-events";
import type { PluginEventType } from "@tau/plugins";

interface Change {
  seq: number;
  domain: string;
  entity_id: string;
  action: string | null;
}
export interface ObjectEventPage {
  cursor: number;
  events: DomainEventRecord[];
  hasMore: boolean;
  reset: boolean;
}
const DOMAINS = new Set(["todo", "event", "todo-list", "calendar"]);
const ACTIONS = new Set(["created", "updated", "deleted"]);

export default class DataChangeEventsTable {
  static head(db: Database.Database): number {
    return (
      db
        .prepare(
          "SELECT MAX(COALESCE((SELECT seq FROM main.sqlite_sequence WHERE name='data_change_log'),0),COALESCE((SELECT MAX(seq) FROM data_change_log),0)) AS head"
        )
        .get() as { head: number }
    ).head;
  }
  static read(db: Database.Database, after: number | null, at = Date.now()): ObjectEventPage {
    if (db.inTransaction) throw new Error("对象通知不能读取未提交事务");
    if (after !== null && (!Number.isSafeInteger(after) || after < 0))
      throw new Error("对象事件水位无效");
    return db.transaction(() => {
      const head = this.head(db);
      const floor = (
        db
          .prepare(
            "SELECT MAX(pruned_through,?-retention,COALESCE((SELECT MIN(seq)-1 FROM data_change_log),?)) AS floor FROM data_change_state WHERE id='main'"
          )
          .get(head, head) as { floor: number }
      ).floor;
      if (after === null) return { cursor: head, events: [], hasMore: false, reset: false };
      if (after < floor || after > head)
        return { cursor: head, events: [], hasMore: false, reset: true };
      const rows = db
        .prepare(
          "SELECT seq,domain,entity_id,action FROM data_change_log WHERE seq>? AND seq<=? ORDER BY seq LIMIT 200"
        )
        .all(after, head) as Change[];
      const pending = new Map<
        string,
        {
          type: PluginEventType;
          id: string;
          at: number;
          action: string;
          first: string;
          seq: number;
        }
      >();
      for (const row of rows) {
        if (!DOMAINS.has(row.domain)) continue;
        if (!row.action || !ACTIONS.has(row.action))
          return { cursor: head, events: [], hasMore: false, reset: true };
        const key = `${row.domain}\0${row.entity_id}`;
        const previous = pending.get(key);
        const first = previous?.first ?? row.action;
        const action =
          row.action === "deleted"
            ? "deleted"
            : first === "created"
              ? "created"
              : first === "deleted" && row.action === "created"
                ? "updated"
                : row.action;
        pending.set(key, {
          type: `${row.domain}.${action}` as PluginEventType,
          id: row.entity_id,
          at,
          action,
          first,
          seq: row.seq,
        });
      }
      const cursor = rows.at(-1)?.seq ?? head;
      return {
        cursor,
        hasMore: cursor < head,
        reset: false,
        events: [...pending.values()]
          .sort((a, b) => a.seq - b.seq)
          .map(({ type, id, at }) => ({ type, id, at })),
      };
    })();
  }
}
