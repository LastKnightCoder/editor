import Database from "better-sqlite3";
import type { Excerpt } from "@/entity/excerpt/types";
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

/** 网页摘录打开时带上划线 uuid，插件据此滚到那条划线 */
export const WEB_HIGHLIGHT_HASH = "tau-hl";

function excerptInfo(excerpt: Excerpt): MaterialInfo {
  const ref: MaterialRef = { kind: "excerpt", id: excerpt.id };
  let meta: string;
  let open: MaterialOpenTarget;
  if (excerpt.sourceType === "weread") {
    const chapter =
      excerpt.anchor && "chapterTitle" in excerpt.anchor ? excerpt.anchor.chapterTitle : "";
    meta = ["微信读书", `《${excerpt.sourceTitle || "未知书名"}》`, chapter]
      .filter(Boolean)
      .join(" · ");
    // external_id = bookId:bookmarkId 或 bookId:review:reviewId；单书页以 bookmarkId / reviewId 标识每条
    const rest = excerpt.externalId.slice(excerpt.sourceKey.length + 1).replace(/^review:/, "");
    open = {
      page: "weread-book",
      bookId: excerpt.sourceKey,
      ...(rest ? { bookmark: rest } : {}),
    };
  } else {
    meta = `网页 · ${excerpt.sourceTitle || hostOf(excerpt.sourceKey)}`;
    open = {
      page: "external-url",
      url: `${excerpt.sourceKey}#${WEB_HIGHLIGHT_HASH}=${encodeURIComponent(excerpt.externalId)}`,
    };
  }
  return {
    ref,
    title: clip(excerpt.quote),
    meta,
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

    for (const excerpt of ExcerptTable.getByIds(db, ids("excerpt"))) put(excerptInfo(excerpt));

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
