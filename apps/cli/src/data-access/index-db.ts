import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { join } from "node:path";
import sqliteVec from "sqlite-vec";
import { getAppDir, getActiveDbName } from "../utils/path.js";

export type IndexType =
  "card" | "article" | "project-item" | "diary-daily" | "diary-weekly" | "diary-monthly";

export interface FTSResult {
  id: number;
  type: IndexType;
  updateTime: number;
  rank: number;
}

export function getIndexDbPath(dbName: string): string {
  const baseName = dbName.replace(/\.db$/, "");
  return join(getAppDir(), "index", baseName, `${baseName}.index.db`);
}

function hasTable(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1")
    .get(tableName) as { name: string } | undefined;
  return !!row;
}

function isIndexReady(db: Database.Database): boolean {
  if (!hasTable(db, "index_meta")) return false;
  const migration = db.prepare("SELECT value FROM index_meta WHERE key='migration_state'").get() as
    { value?: string } | undefined;
  const rebuild = db.prepare("SELECT value FROM index_meta WHERE key='rebuild_state'").get() as
    { value?: string } | undefined;
  return migration?.value === "done" && rebuild?.value === "ready";
}

function tokenizeQuery(query: string): string {
  const tokens: string[] = [];
  let current = "";
  let inCJK = false;

  for (const ch of query) {
    const code = ch.codePointAt(0)!;
    const isCJK =
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x20000 && code <= 0x2a6df);

    if (isCJK) {
      if (!inCJK && current.trim()) {
        tokens.push(...current.trim().split(/\s+/));
        current = "";
      }
      inCJK = true;
      current += ch;
      if (current.length >= 2) {
        tokens.push(current);
        current = current.slice(1);
      }
    } else {
      if (inCJK) {
        if (current.length >= 1) tokens.push(current);
        current = "";
        inCJK = false;
      }
      current += ch;
    }
  }

  if (current.trim()) {
    if (inCJK) {
      tokens.push(current);
    } else {
      tokens.push(...current.trim().split(/\s+/));
    }
  }

  const unique = [...new Set(tokens.filter(t => t.length > 0))];
  return unique.join(" OR ");
}

export function searchFTS(
  query: string,
  options?: { types?: IndexType[]; limit?: number }
): FTSResult[] | null {
  const dbName = getActiveDbName();
  const indexPath = getIndexDbPath(dbName);

  if (!existsSync(indexPath)) return null;

  let db: Database.Database;
  try {
    db = new Database(indexPath, { readonly: true });
  } catch {
    return null;
  }

  try {
    if (!hasTable(db, "content_fts") || !isIndexReady(db)) {
      return null;
    }

    const types = options?.types;
    const limit = options?.limit ?? 10;
    const ftsQuery = tokenizeQuery(query);

    if (!ftsQuery.trim()) return null;

    const sql = `
      SELECT prefixed_id, update_time, rank FROM (
        SELECT prefixed_id, update_time, rank,
               ROW_NUMBER() OVER (PARTITION BY prefixed_id ORDER BY rank) as rn
        FROM content_fts
        WHERE content MATCH ?
        ${types && types.length > 0 ? ` AND type IN (${types.map(() => "?").join(",")})` : ""}
      ) WHERE rn = 1
      ORDER BY rank
      LIMIT ?
    `;

    const params: unknown[] = [ftsQuery];
    if (types && types.length > 0) {
      params.push(...types);
    }
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as Array<{
      prefixed_id: string;
      update_time: number;
      rank: number;
    }>;

    return rows.map(row => {
      const [type, id] = row.prefixed_id.split(":");
      return {
        id: Number(id),
        type: type as IndexType,
        updateTime: row.update_time,
        rank: row.rank,
      };
    });
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export interface VecResult {
  id: number;
  type: IndexType;
  updateTime: number;
  content: string;
  distance: number;
}

function isVecReady(db: Database.Database): boolean {
  if (!hasTable(db, "vec_documents")) return false;
  if (!hasTable(db, "index_meta")) return false;
  const migration = db.prepare("SELECT value FROM index_meta WHERE key='migration_state'").get() as
    { value?: string } | undefined;
  const vecRebuild = db
    .prepare("SELECT value FROM index_meta WHERE key='vec_rebuild_state'")
    .get() as { value?: string } | undefined;
  const rebuild = db.prepare("SELECT value FROM index_meta WHERE key='rebuild_state'").get() as
    { value?: string } | undefined;
  const rebuildState = vecRebuild?.value || rebuild?.value || "pending";
  return migration?.value === "done" && rebuildState !== "failed";
}

export function searchVec(
  queryEmbedding: number[],
  options?: { types?: IndexType[]; limit?: number; distance?: number }
): VecResult[] | null {
  const dbName = getActiveDbName();
  const indexPath = getIndexDbPath(dbName);

  if (!existsSync(indexPath)) return null;

  let db: Database.Database;
  try {
    db = new Database(indexPath, { readonly: true });
  } catch {
    return null;
  }

  try {
    db.loadExtension(sqliteVec.getLoadablePath());
  } catch {
    db.close();
    return null;
  }

  try {
    if (!isVecReady(db)) {
      return null;
    }

    const types = options?.types;
    const limit = options?.limit ?? 10;
    const maxDistance = options?.distance ?? 0.6;

    const typeClause =
      types && types.length > 0 ? `AND type IN (${types.map(() => "?").join(",")})` : "";

    const sql = `
      SELECT prefixed_id, update_time, content, distance
      FROM vec_documents
      WHERE distance < ? AND vec_embedding match ? ${typeClause} AND k = ?
      ORDER BY distance
    `;

    const params: unknown[] = [maxDistance, JSON.stringify(queryEmbedding)];
    if (types && types.length > 0) {
      params.push(...types);
    }
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as Array<{
      prefixed_id: string;
      update_time: number;
      content: string;
      distance: number;
    }>;

    const seen = new Set<string>();
    const results: VecResult[] = [];

    for (const row of rows) {
      if (seen.has(row.prefixed_id)) continue;
      seen.add(row.prefixed_id);

      const [type, id] = row.prefixed_id.split(":");
      results.push({
        id: Number(id),
        type: type as IndexType,
        updateTime: row.update_time,
        content: row.content,
        distance: row.distance,
      });
    }

    return results;
  } catch {
    return null;
  } finally {
    db.close();
  }
}
