import Database from "better-sqlite3";
import { basename, dirname, join } from "node:path";
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import log from "electron-log";
import { Pdf, PdfAnnotation, PdfBookmark, PdfLibraryItem } from "@/types";
import PathUtil from "../../utils/PathUtil";
import Operation from "./operation";
import pdfIndexDBManager from "../pdf-index-db";
import ChatSessionTable from "./chat-session";

const tableExists = (db: Database.Database, name: string) => {
  const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?");
  return Boolean(stmt.get(name));
};

export default class PdfTable {
  static upgradeTable(db: Database.Database) {
    db.exec(`DROP TABLE IF EXISTS pdf_highlights`);

    if (tableExists(db, "pdf_annotations_v2")) {
      const rows = db.prepare("SELECT * FROM pdf_annotations_v2 ORDER BY id ASC").all();
      const insert = db.prepare(`
        INSERT OR REPLACE INTO pdf_annotations
        (id, create_time, update_time, pdf_id, page_num, annotation_payload, color, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const tx = db.transaction((items: any[]) => {
        for (const item of items) {
          insert.run(
            item.id,
            item.create_time,
            item.update_time,
            item.pdf_id,
            item.page_num,
            item.annotation_payload,
            item.color ?? null,
            item.notes ?? "[]"
          );
        }
      });
      tx(rows);
      db.exec("DROP TABLE pdf_annotations_v2");
    }

    if (tableExists(db, "pdf_bookmarks_v2")) {
      const rows = db.prepare("SELECT * FROM pdf_bookmarks_v2 ORDER BY id ASC").all();
      const insert = db.prepare(`
        INSERT OR REPLACE INTO pdf_bookmarks
        (id, create_time, update_time, pdf_id, bookmark_payload)
        VALUES (?, ?, ?, ?, ?)
      `);
      const tx = db.transaction((items: any[]) => {
        for (const item of items) {
          const destination = item.destination
            ? JSON.parse(item.destination)
            : { pageIndex: Math.max(0, Number(item.page_num || 1) - 1) };
          const bookmarkPayload = {
            title: item.title,
            target: destination ? { type: "destination", destination } : undefined,
            children: [],
          };
          insert.run(
            item.id,
            item.create_time,
            item.update_time,
            item.pdf_id,
            JSON.stringify(bookmarkPayload)
          );
        }
      });
      tx(rows);
      db.exec("DROP TABLE pdf_bookmarks_v2");
    }

    // 添加 type 和 area_data 字段到 pdf_annotations 表（如果不存在）
    const columns = db.pragma("table_info(pdf_annotations)") as Array<{
      name: string;
    }>;
    const columnNames = columns.map(c => c.name);
    if (!columnNames.includes("type")) {
      db.exec("ALTER TABLE pdf_annotations ADD COLUMN type TEXT");
    }
    if (!columnNames.includes("area_data")) {
      db.exec("ALTER TABLE pdf_annotations ADD COLUMN area_data TEXT");
    }

    const pdfColumns = (db.pragma("table_info(pdfs)") as Array<{ name: string }>).map(c => c.name);
    for (const column of ["page_count", "last_open_time", "last_page"]) {
      if (!pdfColumns.includes(column)) {
        db.exec(`ALTER TABLE pdfs ADD COLUMN ${column} INTEGER`);
      }
    }
  }

  static getListenEvents() {
    return {
      "create-pdf": this.createPdf.bind(this),
      "get-pdf-by-id": this.getPdfById.bind(this),
      "get-pdf-list": this.getPdfList.bind(this),
      "update-pdf": this.updatePdf.bind(this),
      "delete-pdf": this.removePdf.bind(this),
      "pdf:library": this.getPdfLibrary.bind(this),
      "pdf:record-open": this.recordOpen.bind(this),
      "pdf:record-page": this.recordPage.bind(this),
      "pdf:save-thumbnail": this.saveThumbnail.bind(this),
      "add-pdf-annotation": this.addPdfAnnotation.bind(this),
      "update-pdf-annotation": this.updatePdfAnnotation.bind(this),
      "get-pdf-annotations": this.getPdfAnnotations.bind(this),
      "delete-pdf-annotation": this.removePdfAnnotation.bind(this),
      "add-pdf-bookmark": this.addPdfBookmark.bind(this),
      "update-pdf-bookmark": this.updatePdfBookmark.bind(this),
      "get-pdf-bookmarks": this.getPdfBookmarks.bind(this),
      "delete-pdf-bookmark": this.removePdfBookmark.bind(this),
    };
  }

  static parsePdf(pdf: any): Pdf {
    return {
      ...pdf,
      tags: JSON.parse(pdf.tags || "[]"),
      isLocal: Boolean(pdf.is_local),
      createTime: pdf.create_time,
      updateTime: pdf.update_time,
      fileName: pdf.file_name,
      filePath: pdf.file_path,
      remoteUrl: pdf.remote_url,
      pageCount: pdf.page_count ?? null,
      lastOpenTime: pdf.last_open_time ?? null,
      lastPage: pdf.last_page ?? null,
    };
  }

  static parsePdfAnnotation(record: any): PdfAnnotation {
    return {
      id: record.id,
      createTime: record.create_time,
      updateTime: record.update_time,
      pdfId: record.pdf_id,
      annotation: JSON.parse(record.annotation_payload),
      color: record.color || undefined,
      notes: record.notes ? JSON.parse(record.notes) : [],
      type: record.type || undefined,
      areaData: record.area_data ? JSON.parse(record.area_data) : undefined,
    };
  }

  static parsePdfBookmark(record: any): PdfBookmark {
    return {
      id: record.id,
      createTime: record.create_time,
      updateTime: record.update_time,
      pdfId: record.pdf_id,
      bookmark: JSON.parse(record.bookmark_payload),
    };
  }

  static createPdf(db: Database.Database, pdf: Omit<Pdf, "id" | "createTime" | "updateTime">): Pdf {
    const stmt = db.prepare(`
      INSERT INTO pdfs 
      (tags, is_local, category, file_name, file_path, remote_url, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      JSON.stringify(pdf.tags),
      Number(pdf.isLocal),
      pdf.category,
      pdf.fileName,
      pdf.filePath,
      pdf.remoteUrl,
      now,
      now
    );

    Operation.insertOperation(db, "pdf", "insert", res.lastInsertRowid, now);

    return this.getPdfById(db, Number(res.lastInsertRowid));
  }

  static updatePdf(db: Database.Database, pdf: Pdf): Pdf {
    const stmt = db.prepare(`
      UPDATE pdfs SET
        tags = ?,
        is_local = ?,
        category = ?,
        file_name = ?,
        file_path = ?,
        remote_url = ?,
        update_time = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      JSON.stringify(pdf.tags),
      Number(pdf.isLocal),
      pdf.category,
      pdf.fileName,
      pdf.filePath,
      pdf.remoteUrl,
      now,
      pdf.id
    );

    Operation.insertOperation(db, "pdf", "update", pdf.id, now);

    return this.getPdfById(db, pdf.id);
  }

  static getPdfById(db: Database.Database, id: number): Pdf {
    const stmt = db.prepare("SELECT * FROM pdfs WHERE id = ?");
    const pdf = stmt.get(id);
    return this.parsePdf(pdf);
  }

  static getPdfList(db: Database.Database): Pdf[] {
    const stmt = db.prepare("SELECT * FROM pdfs ORDER BY create_time DESC");
    const pdfs = stmt.all();
    return pdfs.map(pdf => this.parsePdf(pdf));
  }

  /** 缩略图按工作区数据库分目录：<编辑器目录>/pdf-thumbnails/<库名>/<id>.webp */
  static getThumbnailPath(db: Database.Database, id: number): string {
    const dbName = basename(db.name).replace(/\.db$/, "");
    return join(PathUtil.getAppDir(), "pdf-thumbnails", dbName, `${id}.webp`);
  }

  static getPdfLibrary(db: Database.Database): PdfLibraryItem[] {
    const rows = db
      .prepare(
        `SELECT p.*, (SELECT COUNT(*) FROM pdf_annotations a WHERE a.pdf_id = p.id) AS annotation_count
         FROM pdfs p ORDER BY p.create_time DESC`
      )
      .all() as any[];
    return rows.map(row => {
      const thumbnailPath = this.getThumbnailPath(db, row.id);
      const thumbnailVersion = existsSync(thumbnailPath) ? statSync(thumbnailPath).mtimeMs : null;
      return {
        ...this.parsePdf(row),
        annotationCount: Number(row.annotation_count) || 0,
        thumbnailPath: thumbnailVersion === null ? null : thumbnailPath,
        thumbnailVersion,
        fileMissing: Boolean(row.is_local) && (!row.file_path || !existsSync(row.file_path)),
      };
    });
  }

  // 阅读状态不是内容修改：不动 update_time（阅读器以 updateTime 作为重载键），也不记 operation
  static recordOpen(db: Database.Database, id: number): void {
    db.prepare("UPDATE pdfs SET last_open_time = ? WHERE id = ?").run(Date.now(), id);
  }

  static recordPage(db: Database.Database, id: number, page: number): void {
    db.prepare("UPDATE pdfs SET last_page = ? WHERE id = ?").run(page, id);
  }

  static saveThumbnail(
    db: Database.Database,
    id: number,
    image: Uint8Array,
    pageCount: number
  ): void {
    // 生成期间文件可能已被删除：行不存在就不落盘，免得留下孤儿缩略图
    const { changes } = db
      .prepare("UPDATE pdfs SET page_count = ? WHERE id = ?")
      .run(pageCount, id);
    if (changes === 0) return;
    const thumbnailPath = this.getThumbnailPath(db, id);
    mkdirSync(dirname(thumbnailPath), { recursive: true });
    writeFileSync(thumbnailPath, image);
  }

  static removePdf(db: Database.Database, id: number): number {
    const removeAnnotations = db.prepare("DELETE FROM pdf_annotations WHERE pdf_id = ?");
    const removeBookmarks = db.prepare("DELETE FROM pdf_bookmarks WHERE pdf_id = ?");
    const removePdf = db.prepare("DELETE FROM pdfs WHERE id = ?");
    const tx = db.transaction(() => {
      removeAnnotations.run(id);
      removeBookmarks.run(id);
      const result = removePdf.run(id);
      if (result.changes > 0) {
        Operation.insertOperation(db, "pdf", "delete", id, Date.now());
      }
      return result.changes;
    });
    const changes = tx();
    if (changes > 0) {
      pdfIndexDBManager.deleteDatabase(basename(db.name), id);
      // PDF 对话（目录行 + 会话文件）随 PDF 一起删
      ChatSessionTable.removeByDomain(db, "pdf-chat", String(id));
      try {
        rmSync(this.getThumbnailPath(db, id), { force: true });
      } catch (error) {
        log.error(`[PdfTable] 删除缩略图失败: id=${id}, ${error}`);
      }
    }
    return changes;
  }

  static getPdfAnnotationById(db: Database.Database, id: number): PdfAnnotation {
    const stmt = db.prepare("SELECT * FROM pdf_annotations WHERE id = ?");
    const record = stmt.get(id);
    return this.parsePdfAnnotation(record);
  }

  static addPdfAnnotation(
    db: Database.Database,
    annotation: Omit<PdfAnnotation, "id" | "createTime" | "updateTime"> & { id?: number }
  ): PdfAnnotation {
    // 撤销删除带回原 id：仍空着就沿用，被占用则分配新 id
    const reuseId =
      Number.isSafeInteger(annotation.id) &&
      (annotation.id as number) > 0 &&
      !db.prepare("SELECT 1 FROM pdf_annotations WHERE id = ?").get(annotation.id)
        ? (annotation.id as number)
        : null;
    const stmt = db.prepare(`
      INSERT INTO pdf_annotations
      (id, pdf_id, page_num, annotation_payload, color, notes, type, area_data, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      reuseId,
      annotation.pdfId,
      annotation.annotation.pageIndex ?? 0,
      JSON.stringify(annotation.annotation),
      annotation.color ?? null,
      JSON.stringify(annotation.notes ?? []),
      annotation.type ?? null,
      annotation.areaData ? JSON.stringify(annotation.areaData) : null,
      now,
      now
    );

    Operation.insertOperation(db, "pdf-annotation", "insert", res.lastInsertRowid, now);

    return this.getPdfAnnotationById(db, Number(res.lastInsertRowid));
  }

  static updatePdfAnnotation(db: Database.Database, annotation: PdfAnnotation): PdfAnnotation {
    const stmt = db.prepare(`
      UPDATE pdf_annotations SET
        pdf_id = ?,
        page_num = ?,
        annotation_payload = ?,
        color = ?,
        notes = ?,
        type = ?,
        area_data = ?,
        update_time = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      annotation.pdfId,
      annotation.annotation.pageIndex ?? 0,
      JSON.stringify(annotation.annotation),
      annotation.color ?? null,
      JSON.stringify(annotation.notes ?? []),
      annotation.type ?? null,
      annotation.areaData ? JSON.stringify(annotation.areaData) : null,
      now,
      annotation.id
    );

    Operation.insertOperation(db, "pdf-annotation", "update", annotation.id, now);

    return this.getPdfAnnotationById(db, annotation.id);
  }

  static getPdfAnnotations(db: Database.Database, pdfId: number): PdfAnnotation[] {
    const stmt = db.prepare(
      "SELECT * FROM pdf_annotations WHERE pdf_id = ? ORDER BY create_time ASC"
    );
    const annotations = stmt.all(pdfId);
    return annotations.map((record: any) => this.parsePdfAnnotation(record));
  }

  static removePdfAnnotation(db: Database.Database, id: number): number {
    const stmt = db.prepare("DELETE FROM pdf_annotations WHERE id = ?");
    Operation.insertOperation(db, "pdf-annotation", "delete", id, Date.now());
    return stmt.run(id).changes;
  }

  static getPdfBookmarkById(db: Database.Database, id: number): PdfBookmark {
    const stmt = db.prepare("SELECT * FROM pdf_bookmarks WHERE id = ?");
    const record = stmt.get(id);
    return this.parsePdfBookmark(record);
  }

  static addPdfBookmark(
    db: Database.Database,
    bookmark: Omit<PdfBookmark, "id" | "createTime" | "updateTime">
  ): PdfBookmark {
    const stmt = db.prepare(`
      INSERT INTO pdf_bookmarks
      (pdf_id, bookmark_payload, create_time, update_time)
      VALUES (?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(bookmark.pdfId, JSON.stringify(bookmark.bookmark), now, now);

    Operation.insertOperation(db, "pdf-bookmark", "insert", res.lastInsertRowid, now);

    return this.getPdfBookmarkById(db, Number(res.lastInsertRowid));
  }

  static updatePdfBookmark(db: Database.Database, bookmark: PdfBookmark): PdfBookmark {
    const stmt = db.prepare(`
      UPDATE pdf_bookmarks SET
        pdf_id = ?,
        bookmark_payload = ?,
        update_time = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(bookmark.pdfId, JSON.stringify(bookmark.bookmark), now, bookmark.id);

    Operation.insertOperation(db, "pdf-bookmark", "update", bookmark.id, now);

    return this.getPdfBookmarkById(db, bookmark.id);
  }

  static getPdfBookmarks(db: Database.Database, pdfId: number): PdfBookmark[] {
    const stmt = db.prepare(
      "SELECT * FROM pdf_bookmarks WHERE pdf_id = ? ORDER BY create_time ASC"
    );
    const bookmarks = stmt.all(pdfId);
    return bookmarks.map((record: any) => this.parsePdfBookmark(record));
  }

  static removePdfBookmark(db: Database.Database, id: number): number {
    const stmt = db.prepare("DELETE FROM pdf_bookmarks WHERE id = ?");
    Operation.insertOperation(db, "pdf-bookmark", "delete", id, Date.now());
    return stmt.run(id).changes;
  }
}
