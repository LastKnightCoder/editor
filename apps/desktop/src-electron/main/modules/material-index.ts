/**
 * 外部材料进主库向量 / 全文索引（KL-037）：候选文档与检索结果解析。向量队列、全文队列、
 * 检索结果解析共用一份口径。
 *
 * - 摘录：未软删除的；PDF 标注：有原文或批注的；剪藏：仍挂在网页条目上的（孤儿不进）。
 * - 摘录、标注很短，嵌入文本带来源上下文（书名 › 章节 / 网页标题 / 文件名 · 页码），与「嵌入带标题路径」同一思路。
 */

import type Database from "better-sqlite3";
import type { Descendant } from "slate";
import type { Excerpt } from "@/entity/excerpt/types";
import { excerptIndexHeader } from "@/entity/excerpt/display";
import { MATERIAL_KINDS, type MaterialInfo, type MaterialKind } from "@/entity/material";
import { pdfAnnotationNote, pdfAnnotationQuote } from "@/entity/pdf-annotation-text";
import { getMarkdown } from "@/utils/markdown.ts";
import { splitSections, type ContentSection } from "@/entity/sections";
import ExcerptTable from "./tables/excerpt";
import MaterialTable from "./tables/material";
import type { IndexCandidate } from "./index-candidates";

export const MATERIAL_INDEX_TYPES = MATERIAL_KINDS;

export interface MaterialIndexDoc {
  id: number;
  type: MaterialKind;
  content: string;
  updateTime: number;
  title?: string;
  sections?: ContentSection[];
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const joinLines = (...lines: string[]) => lines.filter(line => line.trim()).join("\n");

export function excerptIndexText(excerpt: Excerpt): string {
  return joinLines(
    excerptIndexHeader(excerpt),
    excerpt.quote,
    excerpt.note ? `想法：${excerpt.note}` : ""
  );
}

const parseContent = (raw: string | null): Descendant[] => {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

/** 仍挂在网页条目上的剪藏：有 clipped_from 入边且网页条目还在 */
const ATTACHED_WEB_CLIP_SQL = `
  SELECT c.id, c.title, c.url, c.content_id,
         MAX(c.update_time, COALESCE(ct.update_time, 0)) AS update_time
  FROM web_clip c LEFT JOIN contents ct ON ct.id = c.content_id
  WHERE EXISTS (
    SELECT 1 FROM entity_lineage l JOIN project_item i ON i.id = CAST(l.src_id AS INTEGER)
    WHERE l.dst_kind = 'web-clip' AND l.dst_id = CAST(c.id AS TEXT)
      AND l.relation = 'clipped_from' AND l.src_kind = 'project-item'
  )`;

/** 全部材料候选；剪藏正文逐条读，不一次把所有解析文档读进内存 */
export function listMaterialIndexDocs(mainDb: Database.Database): MaterialIndexDoc[] {
  const docs: MaterialIndexDoc[] = [];
  for (const candidate of listMaterialIndexCandidates(mainDb)) {
    const input = candidate.read();
    if (!("raw" in input)) {
      docs.push({
        ...input,
        id: Number(candidate.id),
        type: candidate.type as MaterialKind,
        updateTime: candidate.updateTime,
      });
      continue;
    }
    const nodes = parseContent(input.raw);
    const body = getMarkdown(nodes).trim();
    if (!body) continue;
    docs.push({
      id: Number(candidate.id),
      type: candidate.type as MaterialKind,
      title: candidate.title,
      updateTime: candidate.updateTime,
      content: joinLines(candidate.title ?? "", body),
      sections: splitSections(nodes, candidate.title ?? ""),
    });
  }
  return docs;
}

/** 候选先提供修订号，剪藏全文仅在调用 read 时读取。 */
export function* listMaterialIndexCandidates(mainDb: Database.Database): Generator<IndexCandidate> {
  for (const excerpt of ExcerptTable.listActive(mainDb)) {
    yield {
      id: excerpt.id,
      type: "excerpt",
      read: () => ({ content: excerptIndexText(excerpt) }),
      updateTime: excerpt.updateTime,
    };
  }

  const annotations = mainDb
    .prepare(
      `SELECT a.id, a.update_time, a.page_num, a.annotation_payload, a.notes, p.file_name
       FROM pdf_annotations a JOIN pdfs p ON p.id = a.pdf_id`
    )
    .all() as Array<{
    id: number;
    update_time: number;
    page_num: number;
    annotation_payload: string;
    notes: string | null;
    file_name: string;
  }>;
  for (const row of annotations) {
    const quote = pdfAnnotationQuote(row.annotation_payload);
    const note = pdfAnnotationNote(row.notes);
    if (!quote && !note) continue;
    yield {
      id: row.id,
      type: "pdf-annotation",
      read: () => ({
        content: joinLines(
          `${row.file_name} · 第 ${row.page_num + 1} 页`,
          quote,
          note ? `批注：${note}` : ""
        ),
      }),
      updateTime: Number(row.update_time || 0),
    };
  }

  const clips = mainDb.prepare(ATTACHED_WEB_CLIP_SQL).all() as Array<{
    id: number;
    title: string;
    url: string;
    content_id: number;
    update_time: number;
  }>;
  const readContent = mainDb.prepare(`SELECT content FROM contents WHERE id = ?`);
  for (const clip of clips) {
    yield {
      id: clip.id,
      type: "web-clip",
      title: clip.title || hostOf(clip.url),
      read: () => ({
        raw:
          (readContent.get(clip.content_id) as { content: string | null } | undefined)?.content ??
          "[]",
        prefixTitle: true,
      }),
      updateTime: Number(clip.update_time || 0),
    };
  }
}

const paragraph = (text: string): Descendant =>
  ({ type: "paragraph", children: [{ type: "formatted", text }] }) as unknown as Descendant;

/** 检索命中的材料 → 结果详情；材料已不存在时返回 null */
export function materialSearchDetails(
  mainDb: Database.Database,
  type: MaterialKind,
  id: number
): { contentId: number; title: string; content: Descendant[]; material: MaterialInfo } | null {
  const info = MaterialTable.resolveOne(mainDb, { kind: type, id });
  if (!info || info.deleted) return null;
  if (type === "web-clip") {
    const row = mainDb
      .prepare(
        `SELECT c.content_id, ct.content FROM web_clip c LEFT JOIN contents ct ON ct.id = c.content_id WHERE c.id = ?`
      )
      .get(id) as { content_id: number; content: string | null } | undefined;
    return {
      contentId: row?.content_id ?? 0,
      title: info.title,
      content: parseContent(row?.content ?? null),
      material: info,
    };
  }
  return {
    contentId: 0,
    title: info.title,
    content: [info.quote, info.note].filter(Boolean).map(paragraph),
    material: info,
  };
}

export const isMaterialIndexType = (type: string): type is MaterialKind =>
  (MATERIAL_INDEX_TYPES as readonly string[]).includes(type);
