import Database from "better-sqlite3";
import { Epub, EpubAnnotation, EpubBookmark } from "@/types";
import Operation from "./operation";

const tableExists = (db: Database.Database, name: string) => {
  const stmt = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
  );
  return Boolean(stmt.get(name));
};

export default class EpubTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS epubs (
        id INTEGER PRIMARY KEY NOT NULL,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        tags TEXT,
        is_local INTEGER NOT NULL,
        category TEXT DEFAULT 'default',
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        remote_url TEXT,
        title TEXT,
        author TEXT,
        cover_url TEXT,
        progress_cfi TEXT,
        progress_percentage REAL DEFAULT 0
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS epub_annotations (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        epub_id INTEGER NOT NULL,
        cfi TEXT NOT NULL,
        type TEXT NOT NULL,
        text TEXT,
        color TEXT,
        style TEXT,
        notes TEXT NOT NULL,
        chapter_title TEXT,
        chapter_href TEXT
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS epub_bookmarks (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        epub_id INTEGER NOT NULL,
        cfi TEXT NOT NULL,
        title TEXT,
        chapter_title TEXT
      )
    `);
  }

  static upgradeTable(db: Database.Database) {
    // 添加 style 字段到 epub_annotations 表（如果不存在）
    if (tableExists(db, "epub_annotations")) {
      const columns = db.pragma("table_info(epub_annotations)") as Array<{
        name: string;
      }>;
      const columnNames = columns.map((c) => c.name);
      if (!columnNames.includes("style")) {
        db.exec("ALTER TABLE epub_annotations ADD COLUMN style TEXT");
      }
    }
  }

  static getListenEvents() {
    return {
      "create-epub": this.createEpub.bind(this),
      "get-epub-by-id": this.getEpubById.bind(this),
      "get-epub-list": this.getEpubList.bind(this),
      "update-epub": this.updateEpub.bind(this),
      "delete-epub": this.removeEpub.bind(this),
      "update-epub-progress": this.updateEpubProgress.bind(this),
      "add-epub-annotation": this.addEpubAnnotation.bind(this),
      "update-epub-annotation": this.updateEpubAnnotation.bind(this),
      "get-epub-annotations": this.getEpubAnnotations.bind(this),
      "delete-epub-annotation": this.removeEpubAnnotation.bind(this),
      "add-epub-bookmark": this.addEpubBookmark.bind(this),
      "update-epub-bookmark": this.updateEpubBookmark.bind(this),
      "get-epub-bookmarks": this.getEpubBookmarks.bind(this),
      "delete-epub-bookmark": this.removeEpubBookmark.bind(this),
    };
  }

  static parseEpub(epub: any): Epub {
    return {
      ...epub,
      tags: JSON.parse(epub.tags || "[]"),
      isLocal: Boolean(epub.is_local),
      createTime: epub.create_time,
      updateTime: epub.update_time,
      fileName: epub.file_name,
      filePath: epub.file_path,
      remoteUrl: epub.remote_url,
      coverUrl: epub.cover_url,
      progressCfi: epub.progress_cfi,
      progressPercentage: epub.progress_percentage ?? 0,
    };
  }

  static parseEpubAnnotation(record: any): EpubAnnotation {
    return {
      id: record.id,
      createTime: record.create_time,
      updateTime: record.update_time,
      epubId: record.epub_id,
      cfi: record.cfi,
      type: record.type,
      text: record.text || undefined,
      color: record.color || undefined,
      style: record.style || undefined,
      notes: record.notes ? JSON.parse(record.notes) : [],
      chapterTitle: record.chapter_title || undefined,
      chapterHref: record.chapter_href || undefined,
    };
  }

  static parseEpubBookmark(record: any): EpubBookmark {
    return {
      id: record.id,
      createTime: record.create_time,
      updateTime: record.update_time,
      epubId: record.epub_id,
      cfi: record.cfi,
      title: record.title || undefined,
      chapterTitle: record.chapter_title || undefined,
    };
  }

  // ==================== EPUB CRUD ====================

  static createEpub(
    db: Database.Database,
    epub: Omit<Epub, "id" | "createTime" | "updateTime">,
  ): Epub {
    const stmt = db.prepare(`
      INSERT INTO epubs
      (tags, is_local, category, file_name, file_path, remote_url, title, author, cover_url, progress_cfi, progress_percentage, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      JSON.stringify(epub.tags),
      Number(epub.isLocal),
      epub.category,
      epub.fileName,
      epub.filePath,
      epub.remoteUrl,
      epub.title,
      epub.author,
      epub.coverUrl,
      epub.progressCfi,
      epub.progressPercentage ?? 0,
      now,
      now,
    );

    Operation.insertOperation(db, "epub", "insert", res.lastInsertRowid, now);

    return this.getEpubById(db, Number(res.lastInsertRowid));
  }

  static updateEpub(db: Database.Database, epub: Epub): Epub {
    const stmt = db.prepare(`
      UPDATE epubs SET
        tags = ?,
        is_local = ?,
        category = ?,
        file_name = ?,
        file_path = ?,
        remote_url = ?,
        title = ?,
        author = ?,
        cover_url = ?,
        progress_cfi = ?,
        progress_percentage = ?,
        update_time = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      JSON.stringify(epub.tags),
      Number(epub.isLocal),
      epub.category,
      epub.fileName,
      epub.filePath,
      epub.remoteUrl,
      epub.title,
      epub.author,
      epub.coverUrl,
      epub.progressCfi,
      epub.progressPercentage ?? 0,
      now,
      epub.id,
    );

    Operation.insertOperation(db, "epub", "update", epub.id, now);

    return this.getEpubById(db, epub.id);
  }

  static updateEpubProgress(
    db: Database.Database,
    params: { id: number; progressCfi: string; progressPercentage: number },
  ): Epub {
    const stmt = db.prepare(`
      UPDATE epubs SET
        progress_cfi = ?,
        progress_percentage = ?,
        update_time = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(params.progressCfi, params.progressPercentage, now, params.id);

    return this.getEpubById(db, params.id);
  }

  static getEpubById(db: Database.Database, id: number): Epub {
    const stmt = db.prepare("SELECT * FROM epubs WHERE id = ?");
    const epub = stmt.get(id);
    return this.parseEpub(epub);
  }

  static getEpubList(db: Database.Database): Epub[] {
    const stmt = db.prepare("SELECT * FROM epubs ORDER BY create_time DESC");
    const epubs = stmt.all();
    return epubs.map((epub) => this.parseEpub(epub));
  }

  static removeEpub(db: Database.Database, id: number): number {
    // 删除相关的标注和书签
    db.prepare("DELETE FROM epub_annotations WHERE epub_id = ?").run(id);
    db.prepare("DELETE FROM epub_bookmarks WHERE epub_id = ?").run(id);

    const stmt = db.prepare("DELETE FROM epubs WHERE id = ?");
    Operation.insertOperation(db, "epub", "delete", id, Date.now());
    return stmt.run(id).changes;
  }

  // ==================== Annotation CRUD ====================

  static getEpubAnnotationById(
    db: Database.Database,
    id: number,
  ): EpubAnnotation {
    const stmt = db.prepare("SELECT * FROM epub_annotations WHERE id = ?");
    const record = stmt.get(id);
    return this.parseEpubAnnotation(record);
  }

  static addEpubAnnotation(
    db: Database.Database,
    annotation: Omit<EpubAnnotation, "id" | "createTime" | "updateTime">,
  ): EpubAnnotation {
    const stmt = db.prepare(`
      INSERT INTO epub_annotations
      (epub_id, cfi, type, text, color, style, notes, chapter_title, chapter_href, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      annotation.epubId,
      annotation.cfi,
      annotation.type,
      annotation.text ?? null,
      annotation.color ?? null,
      annotation.style ?? null,
      JSON.stringify(annotation.notes ?? []),
      annotation.chapterTitle ?? null,
      annotation.chapterHref ?? null,
      now,
      now,
    );

    Operation.insertOperation(
      db,
      "epub-annotation",
      "insert",
      res.lastInsertRowid,
      now,
    );

    return this.getEpubAnnotationById(db, Number(res.lastInsertRowid));
  }

  static updateEpubAnnotation(
    db: Database.Database,
    annotation: EpubAnnotation,
  ): EpubAnnotation {
    const stmt = db.prepare(`
      UPDATE epub_annotations SET
        epub_id = ?,
        cfi = ?,
        type = ?,
        text = ?,
        color = ?,
        style = ?,
        notes = ?,
        chapter_title = ?,
        chapter_href = ?,
        update_time = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      annotation.epubId,
      annotation.cfi,
      annotation.type,
      annotation.text ?? null,
      annotation.color ?? null,
      annotation.style ?? null,
      JSON.stringify(annotation.notes ?? []),
      annotation.chapterTitle ?? null,
      annotation.chapterHref ?? null,
      now,
      annotation.id,
    );

    Operation.insertOperation(
      db,
      "epub-annotation",
      "update",
      annotation.id,
      now,
    );

    return this.getEpubAnnotationById(db, annotation.id);
  }

  static getEpubAnnotations(
    db: Database.Database,
    epubId: number,
  ): EpubAnnotation[] {
    const stmt = db.prepare(
      "SELECT * FROM epub_annotations WHERE epub_id = ? ORDER BY create_time ASC",
    );
    const annotations = stmt.all(epubId);
    return annotations.map((record: any) => this.parseEpubAnnotation(record));
  }

  static removeEpubAnnotation(db: Database.Database, id: number): number {
    const stmt = db.prepare("DELETE FROM epub_annotations WHERE id = ?");
    Operation.insertOperation(db, "epub-annotation", "delete", id, Date.now());
    return stmt.run(id).changes;
  }

  // ==================== Bookmark CRUD ====================

  static getEpubBookmarkById(db: Database.Database, id: number): EpubBookmark {
    const stmt = db.prepare("SELECT * FROM epub_bookmarks WHERE id = ?");
    const record = stmt.get(id);
    return this.parseEpubBookmark(record);
  }

  static addEpubBookmark(
    db: Database.Database,
    bookmark: Omit<EpubBookmark, "id" | "createTime" | "updateTime">,
  ): EpubBookmark {
    const stmt = db.prepare(`
      INSERT INTO epub_bookmarks
      (epub_id, cfi, title, chapter_title, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      bookmark.epubId,
      bookmark.cfi,
      bookmark.title ?? null,
      bookmark.chapterTitle ?? null,
      now,
      now,
    );

    Operation.insertOperation(
      db,
      "epub-bookmark",
      "insert",
      res.lastInsertRowid,
      now,
    );

    return this.getEpubBookmarkById(db, Number(res.lastInsertRowid));
  }

  static updateEpubBookmark(
    db: Database.Database,
    bookmark: EpubBookmark,
  ): EpubBookmark {
    const stmt = db.prepare(`
      UPDATE epub_bookmarks SET
        epub_id = ?,
        cfi = ?,
        title = ?,
        chapter_title = ?,
        update_time = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      bookmark.epubId,
      bookmark.cfi,
      bookmark.title ?? null,
      bookmark.chapterTitle ?? null,
      now,
      bookmark.id,
    );

    Operation.insertOperation(db, "epub-bookmark", "update", bookmark.id, now);

    return this.getEpubBookmarkById(db, bookmark.id);
  }

  static getEpubBookmarks(
    db: Database.Database,
    epubId: number,
  ): EpubBookmark[] {
    const stmt = db.prepare(
      "SELECT * FROM epub_bookmarks WHERE epub_id = ? ORDER BY create_time ASC",
    );
    const bookmarks = stmt.all(epubId);
    return bookmarks.map((record: any) => this.parseEpubBookmark(record));
  }

  static removeEpubBookmark(db: Database.Database, id: number): number {
    const stmt = db.prepare("DELETE FROM epub_bookmarks WHERE id = ?");
    Operation.insertOperation(db, "epub-bookmark", "delete", id, Date.now());
    return stmt.run(id).changes;
  }
}
