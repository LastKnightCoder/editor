/**
 * 旧聊天表退役（pi 迁移 M8）：对话已迁到 pi 会话文件 + chat_session 目录表后，删掉五张旧表
 * （chat_message / pdf_chats / video_note_chats / vibe_learning_chats / audio_note_chats），
 * 并去掉 chat_session 上 M4 时期的分支列（parent_session_id / branch_index）。
 *
 * - 只在两次迁移都已记账后执行（老对话迁移 chat-session-pi-jsonl:v1、树合并 chat-session-tree:v1）：
 *   没迁过的库（比如刚从旧版本远程下载、还没以维护模式开过）原样保留，下次开库迁完再删；
 * - 迁移失败不删旧表；删前 VACUUM INTO 备份整库；
 * - 幂等：没有可删的就什么都不做、也不备份。
 *
 * electron-free，可单测。移动端不删（它不做 pi 迁移，旧表可能还没迁）。
 */
import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { CHAT_SESSION_MIGRATION_KEY } from "./chat-session-migration";
import { CHAT_SESSION_TREE_MIGRATION_KEY, hasBranchColumns } from "./chat-session-tree-migration";

export const LEGACY_CHAT_TABLES = [
  "chat_message",
  "pdf_chats",
  "video_note_chats",
  "vibe_learning_chats",
  "audio_note_chats",
];

const marked = (db: Database.Database, key: string): boolean => {
  const hasMeta = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='migration_meta'")
    .get();
  if (!hasMeta) return false;
  const mark = db.prepare("SELECT value FROM migration_meta WHERE key = ?").get(key) as
    { value: string } | undefined;
  return Boolean(mark && !(JSON.parse(mark.value) as { failed?: number }).failed);
};

export interface LegacyChatRetirementResult {
  retired: boolean;
  droppedTables: string[];
  droppedBranchColumns: boolean;
  backupPath?: string;
}

export function retireLegacyChats(
  db: Database.Database,
  databasePath: string
): LegacyChatRetirementResult {
  const nothing = { retired: false, droppedTables: [], droppedBranchColumns: false };
  if (!marked(db, CHAT_SESSION_MIGRATION_KEY) || !marked(db, CHAT_SESSION_TREE_MIGRATION_KEY)) {
    return nothing;
  }
  const tables = LEGACY_CHAT_TABLES.filter(name =>
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)
  );
  const branchColumns = hasBranchColumns(db);
  if (tables.length === 0 && !branchColumns) return nothing;

  let backupPath: string | undefined;
  if (databasePath !== ":memory:") {
    backupPath = `${databasePath}.pre-legacy-chat-retirement-v1-${randomUUID()}.bak`;
    db.prepare("VACUUM INTO ?").run(backupPath);
  }
  db.transaction(() => {
    // 表上的索引随表一起删
    for (const name of tables) db.exec(`DROP TABLE IF EXISTS ${name}`);
    if (branchColumns) {
      // 带索引的列删不掉，先删索引
      db.exec("DROP INDEX IF EXISTS idx_chat_session_parent");
      db.exec("ALTER TABLE chat_session DROP COLUMN parent_session_id");
      db.exec("ALTER TABLE chat_session DROP COLUMN branch_index");
    }
  })();
  return {
    retired: true,
    droppedTables: tables,
    droppedBranchColumns: branchColumns,
    ...(backupPath ? { backupPath } : {}),
  };
}
