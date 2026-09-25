import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { readdirSync, unlinkSync } from "node:fs";
import type { MigrationDatabase } from "./knowledge-migration";
import { EDITOR_BLOCK_CARRIERS, stripRetiredEditorBlocks } from "./retired-editor-blocks";
import { getContentLength } from "./content-length";

interface EditorDatabase extends MigrationDatabase {
  function(name: string, fn: (...args: any[]) => any): unknown;
}

const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const columns = (db: MigrationDatabase, table: string) =>
  new Set(
    db
      .prepare(`PRAGMA table_info(${quote(table)})`)
      .all()
      .map(row => row.name as string)
  );

const warnedLocations = new Set<string>();

function cleanJson(value: string, location: string): string {
  if (!value) return value;
  // 旧闪卡题面和详解允许纯文本，只有 JSON 结构才承载编辑器节点。
  if (/^flashcards:[^.]+\.(prompt|detail)$/.test(location) && !/^\s*(?:\[\s*[\[{]|\{)/.test(value))
    return value;
  try {
    const result = stripRetiredEditorBlocks(JSON.parse(value));
    return result.changed ? JSON.stringify(result.value) : value;
  } catch {
    // 存量行可能是纯文本或损坏 JSON：保留原值跳过清理，绝不能让开库或触发器写入失败
    if (warnedLocations.add(location)) {
      console.warn(`[editor-block-retirement] ${location} 不是合法 JSON，已保留原值`);
    }
    return value;
  }
}

function safeContentCount(value: string): number | null {
  try {
    return getContentLength(JSON.parse(value));
  } catch {
    return null;
  }
}

/** 退役备份只保留最新一份，避免反复恢复旧备份时无限累积全库体积的 .bak 文件。 */
function removeStaleBackups(databasePath: string, keepPath: string): void {
  const directory = dirname(databasePath);
  const prefix = `${basename(databasePath)}.pre-editor-block-retirement-v1-`;
  for (const name of readdirSync(directory)) {
    const candidate = join(directory, name);
    if (name.startsWith(prefix) && name.endsWith(".bak") && candidate !== keepPath) {
      try {
        unlinkSync(candidate);
      } catch {
        // 清理失败不影响退役流程，下一轮开库会再次尝试
      }
    }
  }
}

function contentDependentsSql(db: MigrationDatabase, id: string): string {
  let sql = "";
  for (const table of ["cards", "articles", "project_item", "diary_segments", "diary_entries"]) {
    const fields = columns(db, table);
    if (fields.has("content_id") && fields.has("update_time"))
      sql += `UPDATE ${quote(table)} SET update_time=MAX(update_time+1,(SELECT update_time FROM contents WHERE id=${id})) WHERE content_id=${id};`;
  }
  if (
    columns(db, "diary_entries").has("word_count") &&
    columns(db, "diary_segments").has("diary_id")
  )
    sql += `UPDATE diary_entries SET word_count=COALESCE((SELECT SUM(c.count) FROM diary_segments s JOIN contents c ON c.id=s.content_id WHERE s.diary_id=diary_entries.id),0),
      update_time=MAX(update_time+1,(SELECT update_time FROM contents WHERE id=${id}))
      WHERE id IN (SELECT diary_id FROM diary_segments WHERE content_id=${id});`;
  return sql;
}

/** 临时触发器只属于当前连接，覆盖导入和旧客户端提交，不改变共享 schema。 */
export function installEditorBlockGuards(db: EditorDatabase): void {
  db.function("tau_strip_retired_blocks", cleanJson);
  db.function("tau_editor_content_count", safeContentCount);
  for (const [table, column] of EDITOR_BLOCK_CARRIERS) {
    const fields = columns(db, table);
    if (!fields.has(column)) continue;
    const name = `retired_blocks_${table}_${column}`;
    const value = `tau_strip_retired_blocks(NEW.${quote(column)}, '${table}:' || NEW.id || '.${column}')`;
    const count =
      table === "contents" && fields.has("count")
        ? `,count=COALESCE(tau_editor_content_count(${value}),NEW.${quote("count")})`
        : "";
    const timestamp = fields.has("update_time")
      ? ",update_time=MAX(NEW.update_time+1,CAST(strftime('%s','now') AS INTEGER)*1000)"
      : "";
    for (const event of ["INSERT", `UPDATE OF ${quote(column)}`]) {
      const trigger = quote(`${name}_${event === "INSERT" ? "insert" : "update"}`);
      db.exec(`CREATE TEMP TRIGGER IF NOT EXISTS ${trigger} AFTER ${event} ON main.${quote(table)}
        WHEN NEW.${quote(column)} IS NOT NULL AND ${value} IS NOT NEW.${quote(column)}
        BEGIN UPDATE ${quote(table)} SET ${quote(column)}=${value}${count}${timestamp} WHERE id=NEW.id;
        ${table === "contents" ? contentDependentsSql(db, "NEW.id") : ""} END`);
    }
  }
}

/** 每次开库检查实际数据，恢复旧备份也会重新备份、清理；游标分页控制内存。 */
export function retireEditorBlocks(db: EditorDatabase, databasePath: string): number {
  const carriers = EDITOR_BLOCK_CARRIERS.filter(([table, column]) =>
    columns(db, table).has(column)
  );
  function* changes() {
    for (const [table, column] of carriers) {
      let cursor: number | null = null;
      while (true) {
        const rows = db
          .prepare(
            `SELECT id,${quote(column)} AS value FROM ${quote(table)}
          WHERE (? IS NULL OR id>?) AND ${quote(column)} IS NOT NULL AND ${quote(column)}<>''
          ORDER BY id LIMIT 200`
          )
          .all(cursor, cursor);
        if (!rows.length) break;
        for (const row of rows) {
          const next = cleanJson(row.value, `${table}:${row.id}.${column}`);
          if (next !== row.value) yield { table, column, id: row.id, next };
        }
        cursor = rows[rows.length - 1].id;
      }
    }
  }
  installEditorBlockGuards(db);
  // 单遍扫描直接收集变更（退役块行数有限），避免探测遍+事务遍重复全表扫描
  const pending = [...changes()];
  if (!pending.length) return 0;
  if (databasePath !== ":memory:") {
    const backupPath = `${databasePath}.pre-editor-block-retirement-v1-${randomUUID()}.bak`;
    db.prepare("VACUUM INTO ?").run(backupPath);
    removeStaleBackups(databasePath, backupPath);
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    let changed = 0;
    for (const { table, column, id, next } of pending) {
      const fields = columns(db, table);
      const count =
        table === "contents" && fields.has("count")
          ? ",count=COALESCE(tau_editor_content_count(?),count)"
          : "";
      const time = fields.has("update_time") ? ",update_time=MAX(update_time+1,?)" : "";
      db.prepare(`UPDATE ${quote(table)} SET ${quote(column)}=?${count}${time} WHERE id=?`).run(
        next,
        ...(count ? [next] : []),
        ...(time ? [Date.now()] : []),
        id
      );
      if (table === "contents") {
        if (!Number.isSafeInteger(id))
          throw new Error("EDITOR_BLOCK_RETIREMENT_FAILED: 正文 ID 无效");
        const dependentSql = contentDependentsSql(db, String(id));
        if (dependentSql) db.exec(dependentSql);
      }
      changed++;
    }
    db.exec("COMMIT");
    return changed;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
