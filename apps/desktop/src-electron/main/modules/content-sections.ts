import type Database from "better-sqlite3";
import { splitSections, type ContentSection } from "@/entity/sections";
import type { IndexParams, SearchResult } from "@/types/search";
import { importFromMarkdown } from "@/utils/markdown";

export function sectionsForIndex(params: IndexParams): ContentSection[] {
  if (params.sections) return params.sections;
  if (params.type === "excerpt" || params.type === "pdf-annotation") {
    return params.content.trim()
      ? [
          {
            chunkIndex: 0,
            headingPath: "",
            text: params.content,
            blockStart: 0,
            blockEnd: 0,
            charCount: params.content.length,
            embeddingText: params.content,
          },
        ]
      : [];
  }
  return splitSections(
    importFromMarkdown(params.content),
    params.title ?? "",
    params.type === "card"
  );
}

export function writeContentSections(
  db: Database.Database,
  prefixedId: string,
  sections: ContentSection[]
) {
  db.prepare("DELETE FROM content_sections WHERE prefixed_id = ?").run(prefixedId);
  const insert = db.prepare(`INSERT INTO content_sections
    (prefixed_id, chunk_index, heading_path, block_start, block_end, char_count) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const section of sections)
    insert.run(
      prefixedId,
      section.chunkIndex,
      section.headingPath,
      section.blockStart,
      section.blockEnd,
      section.charCount
    );
}

export function readContentSection(
  db: Database.Database,
  prefixedId: string,
  chunkIndex: number | undefined,
  text: string
): SearchResult["section"] {
  if (chunkIndex === undefined || chunkIndex === null) return undefined;
  const row = db
    .prepare(
      `SELECT heading_path, block_start, block_end FROM content_sections WHERE prefixed_id = ? AND chunk_index = ?`
    )
    .get(prefixedId, chunkIndex) as
    | {
        heading_path: string;
        block_start: number;
        block_end: number;
      }
    | undefined;
  return row
    ? {
        chunkIndex,
        headingPath: row.heading_path,
        text,
        blockStart: row.block_start,
        blockEnd: row.block_end,
      }
    : undefined;
}
