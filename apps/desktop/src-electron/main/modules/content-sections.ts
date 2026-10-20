import type Database from "better-sqlite3";
import { WHOLE_MAX_LENGTH, WHOLE_MIN_LENGTH, type ContentSection } from "@/entity/sections";
import type { SearchResult, VecIndexParams } from "@/types/search";
import { sectionsFromMarkdown } from "../services/content-conversion";
import { smartChunkWithRanges } from "../utils/smart-chunk";

export async function sectionsForIndex(
  params: Pick<VecIndexParams, "sections" | "type" | "content" | "title">
): Promise<ContentSection[]> {
  if (params.sections) return params.sections;
  if (params.type === "excerpt" || params.type === "pdf-annotation") {
    if (!params.content.trim()) return [];
    return smartChunkWithRanges(params.content, {
      minLength: WHOLE_MIN_LENGTH,
      maxLength: WHOLE_MAX_LENGTH,
      overlap: 0,
      splitter: "paragraph",
    }).map((chunk, chunkIndex) => ({
      chunkIndex,
      headingPath: "",
      text: chunk.text,
      blockStart: 0,
      blockEnd: 0,
      charCount: chunk.text.length,
      embeddingText: chunk.text,
    }));
  }
  return sectionsFromMarkdown(params.content, params.title ?? "", params.type === "card");
}

/**
 * 节位置按（实体, 正文版本）存一份：全文与向量各自按自己索引时的正文切块，
 * 两边版本不同时各查各的，互不覆盖。写完对应的向量 / 全文行后调用 pruneContentSections 清旧版本。
 */
export function writeContentSections(
  db: Database.Database,
  prefixedId: string,
  updateTime: number,
  sections: ContentSection[]
) {
  db.prepare("DELETE FROM content_sections WHERE prefixed_id = ? AND update_time = ?").run(
    prefixedId,
    updateTime
  );
  const insert = db.prepare(`INSERT INTO content_sections
    (prefixed_id, update_time, chunk_index, heading_path, block_start, block_end, char_count, text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const section of sections)
    insert.run(
      prefixedId,
      updateTime,
      section.chunkIndex,
      section.headingPath,
      section.blockStart,
      section.blockEnd,
      section.charCount,
      section.text
    );
}

const hasTable = (db: Database.Database, name: string) =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE name = ?").get(name);

/** 删掉向量与全文都已不再引用的正文版本 */
export function pruneContentSections(db: Database.Database, prefixedId: string) {
  const live = new Set<number>();
  for (const table of ["content_fts", "vec_documents"]) {
    if (!hasTable(db, table)) continue;
    const rows = db
      .prepare(`SELECT DISTINCT update_time FROM ${table} WHERE prefixed_id = ?`)
      .all(prefixedId) as { update_time: number }[];
    rows.forEach(row => live.add(Number(row.update_time)));
  }
  const versions = db
    .prepare("SELECT DISTINCT update_time FROM content_sections WHERE prefixed_id = ?")
    .all(prefixedId) as { update_time: number }[];
  const remove = db.prepare(
    "DELETE FROM content_sections WHERE prefixed_id = ? AND update_time = ?"
  );
  for (const { update_time } of versions)
    if (!live.has(Number(update_time))) remove.run(prefixedId, update_time);
}

export function readContentSection(
  db: Database.Database,
  prefixedId: string,
  updateTime: number,
  chunkIndex: number | undefined | null
): SearchResult["section"] {
  if (chunkIndex === undefined || chunkIndex === null) return undefined;
  const row = db
    .prepare(
      `SELECT heading_path, block_start, block_end, text FROM content_sections
       WHERE prefixed_id = ? AND update_time = ? AND chunk_index = ?`
    )
    .get(prefixedId, updateTime, chunkIndex) as
    { heading_path: string; block_start: number; block_end: number; text: string } | undefined;
  return row
    ? {
        chunkIndex,
        headingPath: row.heading_path,
        text: row.text,
        blockStart: row.block_start,
        blockEnd: row.block_end,
      }
    : undefined;
}
