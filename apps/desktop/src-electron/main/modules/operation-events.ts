import { basename } from "node:path";
import type Database from "better-sqlite3";
import { warnThrottled } from "../utils/throttled-log";

export interface OperationRecorded {
  database: string;
  contentType: string;
  action: string;
  entityId: number;
  time: number;
}

const listeners = new Set<(event: OperationRecorded) => void>();

export function onOperationRecorded(listener: (event: OperationRecorded) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitOperationRecorded(
  db: Pick<Database.Database, "name" | "memory">,
  contentType: string,
  action: string,
  entityId: number,
  time: number
) {
  const event = {
    database: db.memory ? db.name : basename(db.name),
    contentType,
    action,
    entityId,
    time,
  };
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      // 派生记忆的失败不能中断业务流水提交；但不留痕时记忆与实体索引会悄悄过期
      warnThrottled(
        `operation-events:${contentType}.${action}`,
        "[operation-events] 业务事件监听器失败",
        error,
        { database: event.database, contentType, action, entityId }
      );
    }
  }
}
