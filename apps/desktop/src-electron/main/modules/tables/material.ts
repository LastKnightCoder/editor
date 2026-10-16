import Database from "better-sqlite3";
import type { Excerpt } from "@/entity/excerpt/types";
import { excerptMeta } from "@/entity/excerpt/display";
import type { MaterialInfo, MaterialOpenTarget, MaterialRef } from "@/entity/material";
import { pdfAnnotationNote, pdfAnnotationQuote } from "@/entity/pdf-annotation-text";
import ExcerptTable from "./excerpt";

const TITLE_CHARS = 80;

const clip = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > TITLE_CHARS ? `${flat.slice(0, TITLE_CHARS)}…` : flat;
};

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

function excerptInfo(excerpt: Excerpt, labels: Map<string, string>): MaterialInfo {
  const label = labels.get(excerpt.sourceType) ?? excerpt.sourceType;
  const open: MaterialOpenTarget = {
    page: "excerpt-provider",
    sourceType: excerpt.sourceType,
    sourceKey: excerpt.sourceKey,
    externalId: excerpt.externalId,
    label,
    url: excerpt.url,
  };
  return {
    ref: { kind: "excerpt", id: excerpt.id },
    title: clip(excerpt.quote),
    meta: excerptMeta(excerpt, label),
    quote: excerpt.quote,
    note: excerpt.note,
    deleted: excerpt.isDeleted,
    open: excerpt.isDeleted ? null : open,
  };
}

interface PdfAnnotationRow {
  id: number;
  pdf_id: number;
  page_num: number;
  annotation_payload: string;
  notes: string | null;
  type: string | null;
  file_name: string;
}

function pdfAnnotationInfo(row: PdfAnnotationRow): MaterialInfo {
  const quote = pdfAnnotationQuote(row.annotation_payload);
  const note = pdfAnnotationNote(row.notes);
  const page = row.page_num + 1;
  // 页边批注没有原文，标题即批注
  const margin = row.type === "margin";
  return {
    ref: { kind: "pdf-annotation", id: row.id },
    title: clip(quote || note) || `${margin ? "页边批注" : "区域截图"} · 第 ${page} 页`,
    meta: `PDF · ${row.file_name} · 第 ${page} 页${margin ? " · 页边" : ""}`,
    quote,
    note,
    deleted: false,
    open: { page: "pdf-detail", pdfId: row.pdf_id, annotationId: row.id },
  };
}

interface WebClipRow {
  id: number;
  title: string;
  url: string;
  item_id: number | null;
}

/**
 * 外部材料的展示信息（KL-031）：摘录、PDF 标注、剪藏解析文档。脉络、搜索、对话引用共用一份解析口径。
 */
export default class MaterialTable {
  static getListenEvents() {
    return {
      "material:resolve": this.resolve.bind(this),
    };
  }

  /** 解析一批材料；不存在的（PDF 标注、剪藏已删除）不返回，摘录软删除的照常返回并标记 deleted */
  static resolve(db: Database.Database, refs: MaterialRef[]): MaterialInfo[] {
    const ids = (kind: MaterialRef["kind"]) => [
      ...new Set(refs.filter(ref => ref.kind === kind).map(ref => ref.id)),
    ];
    const found = new Map<string, MaterialInfo>();
    const put = (info: MaterialInfo) => found.set(`${info.ref.kind}:${info.ref.id}`, info);

    const excerpts = ExcerptTable.getByIds(db, ids("excerpt"));
    if (excerpts.length) {
      const labels = ExcerptTable.providerLabels(db);
      for (const excerpt of excerpts) put(excerptInfo(excerpt, labels));
    }

    const annotationIds = ids("pdf-annotation");
    if (annotationIds.length) {
      const rows = db
        .prepare(
          `SELECT a.id, a.pdf_id, a.page_num, a.annotation_payload, a.notes, a.type, p.file_name
           FROM pdf_annotations a JOIN pdfs p ON p.id = a.pdf_id
           WHERE a.id IN (${annotationIds.map(() => "?").join(",")})`
        )
        .all(...annotationIds) as PdfAnnotationRow[];
      rows.forEach(row => put(pdfAnnotationInfo(row)));
    }

    const clipIds = ids("web-clip");
    if (clipIds.length) {
      const rows = db
        .prepare(
          `SELECT c.id, c.title, c.url,
             (SELECT CAST(l.src_id AS INTEGER) FROM entity_lineage l
              JOIN project_item i ON i.id = CAST(l.src_id AS INTEGER)
              WHERE l.dst_kind = 'web-clip' AND l.dst_id = CAST(c.id AS TEXT)
                AND l.relation = 'clipped_from' AND l.src_kind = 'project-item'
              ORDER BY l.id LIMIT 1) AS item_id
           FROM web_clip c WHERE c.id IN (${clipIds.map(() => "?").join(",")})`
        )
        .all(...clipIds) as WebClipRow[];
      for (const row of rows) {
        put({
          ref: { kind: "web-clip", id: row.id },
          title: row.title || hostOf(row.url),
          meta: `剪藏 · ${hostOf(row.url)}`,
          quote: "",
          note: "",
          deleted: false,
          open: row.item_id ? { page: "project-web-clip", itemId: row.item_id } : null,
        });
      }
    }

    return refs.flatMap(ref => found.get(`${ref.kind}:${ref.id}`) ?? []);
  }

  static resolveOne(db: Database.Database, ref: MaterialRef): MaterialInfo | null {
    return this.resolve(db, [ref])[0] ?? null;
  }
}
