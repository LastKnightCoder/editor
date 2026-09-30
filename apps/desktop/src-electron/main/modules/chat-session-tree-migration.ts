/**
 * 分支族合并成会话树（M4-d）：M4 时「建分支」是另拷一个会话文件 + 目录行 parent_session_id，
 * 老对话迁移也是一行一文件。M4-d 起分支都在同一文件的树上，这里把已有的分支族一次性合并：
 * 按分支深度从深到浅（孙分支先并进子分支，子分支再并进根），每个分支文件嫁接进父文件后删掉
 * 文件与目录行。嫁接规则见 pi-session-graft.ts。
 *
 * - 父文件对不上：分支独立保留；读写失败保留关系，不记完成以便重试；
 * - 合并前备份整个会话目录（文件会被改写与删除，.db 里只删行，VACUUM INTO 一并备份）；
 * - migration_meta 记账，只跑一次。记账跟着 .db 同步：另一台机器下载到没合并过的库与会话包时
 *   两者是配对的，开库时会再合并一次。
 *
 * 同步执行（开库与同步后重连都要在通知渲染端之前跑完）。electron-free，可单测。
 */
import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { graftSessionFile } from "./pi-session-graft";
import { resolveSessionFile } from "./pi-session-paths";
import ChatSessionTable from "./tables/chat-session";

export const CHAT_SESSION_TREE_MIGRATION_KEY = "chat-session-tree:v1";

export interface ChatSessionTreeMigrationResult {
  skipped: boolean;
  merged: number;
  /** 对不上父文件、降级成独立对话的分支 */
  detached: number;
  failed: Array<{ id: string; error: string }>;
  backupPath?: string;
}

interface BranchRow {
  id: string;
  session_file: string;
  parent_session_id: string;
}

/** M4 时期的库：目录表上还有分支关系列（M8 起由 legacy-chat-retirement 删掉） */
export const hasBranchColumns = (db: Database.Database): boolean =>
  (db.prepare("PRAGMA table_info(chat_session)").all() as Array<{ name: string }>).some(
    column => column.name === "parent_session_id"
  );

export function mergeChatSessionBranches(options: {
  db: Database.Database;
  databasePath: string;
  sessionDir: string;
}): ChatSessionTreeMigrationResult {
  const { db, sessionDir } = options;
  db.exec("CREATE TABLE IF NOT EXISTS migration_meta (key TEXT PRIMARY KEY, value TEXT)");
  ChatSessionTable.upgradeTable(db);
  const done = db
    .prepare("SELECT value FROM migration_meta WHERE key = ?")
    .get(CHAT_SESSION_TREE_MIGRATION_KEY) as { value: string } | undefined;
  if (done) {
    if (!(JSON.parse(done.value) as { failed?: number }).failed)
      return { skipped: true, merged: 0, detached: 0, failed: [] };
    db.prepare("DELETE FROM migration_meta WHERE key = ?").run(CHAT_SESSION_TREE_MIGRATION_KEY);
  }

  // 新装机与 M8 之后的库没有分支列：老对话迁移已在迁移时直接合并，这里只记账
  const rows = hasBranchColumns(db)
    ? (db
        .prepare(
          "SELECT id, session_file, parent_session_id FROM chat_session WHERE parent_session_id IS NOT NULL"
        )
        .all() as BranchRow[])
    : [];

  let backupPath: string | undefined;
  if (rows.length > 0) {
    const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    if (existsSync(sessionDir) && readdirSync(sessionDir).length > 0) {
      backupPath = `${sessionDir}.pre-tree-migration-${stamp}`;
      cpSync(sessionDir, backupPath, { recursive: true });
    }
    if (options.databasePath !== ":memory:") {
      db.prepare("VACUUM INTO ?").run(`${options.databasePath}.pre-tree-migration-${stamp}.bak`);
    }
  }

  const { merged, detached, failed } = mergeBranchFamilies(
    db,
    sessionDir,
    rows.map(row => ({
      id: row.id,
      sessionFile: row.session_file,
      parentId: row.parent_session_id,
    }))
  );
  // 并完的分支行已删；剩下的（降级成独立对话的）清掉父子关系
  if (rows.length > 0 && failed.length === 0) {
    db.exec(
      "UPDATE chat_session SET parent_session_id = NULL, branch_index = 0 WHERE parent_session_id IS NOT NULL"
    );
  }

  if (failed.length === 0) {
    db.prepare("INSERT OR REPLACE INTO migration_meta (key, value) VALUES (?, ?)").run(
      CHAT_SESSION_TREE_MIGRATION_KEY,
      JSON.stringify({ merged, detached, failed: 0, at: Date.now() })
    );
  }
  return { skipped: false, merged, detached, failed, ...(backupPath ? { backupPath } : {}) };
}

/**
 * 把一组分支（目录行 + 会话文件）并进各自父对话的文件：按深度从深到浅，孙分支先并进子分支、
 * 子分支再并进根。并进去的分支删掉文件与目录行；对不上（第一条消息就不同）或出错的保留为独立对话。
 * 父子关系只在内存里（老对话迁移直接传入，M4 时期的库由上面从分支列读出）。
 */
export function mergeBranchFamilies(
  db: Database.Database,
  sessionDir: string,
  branches: Array<{ id: string; sessionFile: string; parentId: string }>
): Pick<ChatSessionTreeMigrationResult, "merged" | "detached" | "failed"> {
  // 深度：沿父指针数到根。孙分支先并，父分支文件那时还在
  const parentOf = new Map(branches.map(branch => [branch.id, branch.parentId]));
  const depthOf = (id: string): number => {
    let depth = 0;
    let cursor = parentOf.get(id);
    const seen = new Set([id]);
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      depth += 1;
      cursor = parentOf.get(cursor);
    }
    return depth;
  };
  const ordered = [...branches].sort((a, b) => depthOf(b.id) - depthOf(a.id));

  const fileOf = db.prepare("SELECT session_file FROM chat_session WHERE id = ?");
  const removeRow = db.prepare("DELETE FROM chat_session WHERE id = ?");
  const failed: ChatSessionTreeMigrationResult["failed"] = [];
  let merged = 0;
  let detached = 0;

  for (const branch of ordered) {
    try {
      const parentFile = (fileOf.get(branch.parentId) as { session_file: string } | undefined)
        ?.session_file;
      const branchPath = resolveSessionFile(sessionDir, branch.sessionFile);
      const parentPath = parentFile ? resolveSessionFile(sessionDir, parentFile) : undefined;
      if (!existsSync(branchPath)) {
        // 分支还没落盘（首轮没等到回答）：没有内容可并，行也没有意义
        removeRow.run(branch.id);
        merged += 1;
        continue;
      }
      if (!parentPath || !existsSync(parentPath)) {
        detached += 1;
        continue;
      }
      const outcome = graftSessionFile(parentPath, branchPath);
      if (outcome.kind === "unrelated") {
        detached += 1;
        continue;
      }
      removeRow.run(branch.id);
      rmSync(branchPath, { force: true });
      merged += 1;
    } catch (error) {
      failed.push({
        id: branch.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { merged, detached, failed };
}
