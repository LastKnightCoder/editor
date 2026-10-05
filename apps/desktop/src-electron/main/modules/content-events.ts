/**
 * 正文写入总线：主库 contents 的增、改、删统一从这里发出事件，派生数据（引用索引、
 * 后续的 AI 元信息等）订阅它做增量更新。
 *
 * 收口点：ContentTable.createContent / updateContent（无会话分支）/ deleteContent（真正删除时），
 * 以及协作投影写库成功处（日常编辑走这条，不经过 IPC 与 onDatabaseWrite）。
 * 迁移代码不接，由订阅方在数据库连接时对账兜底。
 *
 * 写入方可能处在事务中，事件可能早于提交；订阅方应防抖后再读库。监听器的异常只记日志。
 */

import { basename } from "node:path";
import type Database from "better-sqlite3";

export type ContentWriteAction = "create" | "update" | "delete";

export interface ContentWrittenEvent {
  /** 主库文件名（与 databaseModule 的库名口径一致） */
  dbName: string;
  contentId: number;
  action: ContentWriteAction;
}

type Listener = (event: ContentWrittenEvent) => void;

const listeners = new Set<Listener>();

export function emitContentWritten(
  db: Pick<Database.Database, "name" | "memory">,
  contentId: number,
  action: ContentWriteAction
): void {
  if (listeners.size === 0) return;
  const event: ContentWrittenEvent = {
    dbName: db.memory ? db.name : basename(db.name),
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
