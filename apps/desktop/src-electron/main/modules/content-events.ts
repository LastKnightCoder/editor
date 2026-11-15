/**
 * 正文写入总线：主库 contents 的增、改、删统一从这里发出事件，派生数据（引用索引、
 * 后续的 AI 元信息等）订阅它做增量更新。
 *
 * 收口点：正文创建用例、ContentTable.updateContent（无会话分支）和 deleteContent（真正删除时），
 * 以及协作投影写库成功处（日常编辑走这条，不经过 IPC 与 onDatabaseWrite）。
 * 后台格式升级完成后同样发出更新，避免连接对账早于转换而留下旧投影。
 *
 * 写入方可能处在事务中，事件可能早于提交；订阅方应防抖后再读库。监听器的异常只记日志。
 */

import { basename } from "node:path";
import type Database from "better-sqlite3";

export type ContentWriteAction = "create" | "update" | "delete";

export interface ContentWrittenEvent {
  /** 连接登记的主库名，独立库写入才使用文件名。 */
  dbName: string;
  contentId: number;
  action: ContentWriteAction;
}

type Listener = (event: ContentWrittenEvent) => void;

const listeners = new Set<Listener>();
const connectionNames = new WeakMap<Pick<Database.Database, "name" | "memory">, string>();

export function bindContentWriteConnection(db: Database.Database, name: string): void {
  connectionNames.set(db, name);
}

export function emitContentWritten(
  db: Pick<Database.Database, "name" | "memory">,
  contentId: number,
  action: ContentWriteAction
): void {
  if (listeners.size === 0) return;
  const event: ContentWrittenEvent = {
    dbName: connectionNames.get(db) ?? (db.memory ? db.name : basename(db.name)),
    contentId,
    action,
  };
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error("[content-events] 监听器出错", error);
    }
  }
}

export function onContentWritten(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
