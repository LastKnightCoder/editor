import { basename } from "node:path";
import type Database from "better-sqlite3";

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
    } catch {
      // 派生记忆的失败不能中断业务流水提交。
    }
  }
}
