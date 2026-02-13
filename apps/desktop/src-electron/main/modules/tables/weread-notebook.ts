import { Database } from "better-sqlite3";
import { Table } from "../../types/table";
import type { Notebook } from "@/types/weread";

class WeReadNotebookTable implements Table {
  upgradeTable(_db: Database): void {
    // 未来版本升级时使用
  }

  getListenEvents(): Record<string, (db: Database, ...args: any) => any> {
    return {};
  }

  // 保存或更新笔记本
  save(db: Database, notebook: Notebook): void {
    const metaData = notebook.metaData;
    const readInfo = metaData.readInfo;
    const synckeys = metaData.synckeys || {};

    // 计算阅读状态
    let readingStatus = 0; // 未开始
    if (readInfo) {
      if (readInfo.finishedDate && readInfo.finishedDate > 0) {
        readingStatus = 2; // 已完成
      } else if (readInfo.readingBookDate && readInfo.readingBookDate > 0) {
        readingStatus = 1; // 进行中
      }
    }

    const stmt = db.prepare(`
      INSERT INTO weread_notebook (
        book_id, title, author, cover, intro, category, publisher, isbn,
        total_words, rating, book_type, publish_time, note_count, review_count,
        last_read_date, url, pc_url,
        reading_progress, reading_time, reading_book_date, finished_date,
        marked_status, total_read_day, continue_read_days, reading_status,
        synckey_highlights, synckey_reviews, synckey_progress,
        chapter_highlights, book_review, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?
      )
      ON CONFLICT(book_id) DO UPDATE SET
        title = excluded.title,
        author = excluded.author,
        cover = excluded.cover,
        intro = excluded.intro,
        category = excluded.category,
        publisher = excluded.publisher,
        isbn = excluded.isbn,
        total_words = excluded.total_words,
        rating = excluded.rating,
        note_count = excluded.note_count,
        review_count = excluded.review_count,
        last_read_date = excluded.last_read_date,
        reading_progress = excluded.reading_progress,
        reading_time = excluded.reading_time,
        reading_book_date = excluded.reading_book_date,
        finished_date = excluded.finished_date,
        marked_status = excluded.marked_status,
        total_read_day = excluded.total_read_day,
        continue_read_days = excluded.continue_read_days,
        reading_status = excluded.reading_status,
        synckey_highlights = excluded.synckey_highlights,
        synckey_reviews = excluded.synckey_reviews,
        synckey_progress = excluded.synckey_progress,
        chapter_highlights = excluded.chapter_highlights,
        book_review = excluded.book_review,
        updated_at = excluded.updated_at
    `);

    const now = Date.now();
    stmt.run(
      metaData.bookId,
      metaData.title,
      metaData.author,
      metaData.cover,
      metaData.intro,
      metaData.category,
      metaData.publisher,
      metaData.isbn,
      metaData.totalWords,
      metaData.rating,
      metaData.bookType,
      metaData.publishTime,
      metaData.noteCount,
      metaData.reviewCount,
      metaData.lastReadDate,
      metaData.url,
      metaData.pcUrl,
      readInfo?.readingProgress,
      readInfo?.readingTime,
      readInfo?.readingBookDate,
      readInfo?.finishedDate,
      readInfo?.markedStatus,
      readInfo?.totalReadDay,
      readInfo?.continueReadDays,
      readingStatus,
      synckeys.highlights,
      synckeys.reviews,
      synckeys.progress,
      JSON.stringify(notebook.chapterHighlights),
      JSON.stringify(notebook.bookReview),
      now,
      now,
    );
  }

  // 批量保存
  saveMany(db: Database, notebooks: Notebook[]): void {
    const transaction = db.transaction(() => {
      notebooks.forEach((notebook) => this.save(db, notebook));
    });
    transaction();
  }

  // 获取所有笔记本
  getAll(db: Database): Notebook[] {
    const stmt = db.prepare(`
      SELECT * FROM weread_notebook ORDER BY updated_at DESC
    `);
    const rows = stmt.all() as any[];
    return rows.map((row) => this.rowToNotebook(row));
  }

  // 根据 bookId 获取
  getById(db: Database, bookId: string): Notebook | null {
    const stmt = db.prepare(`
      SELECT * FROM weread_notebook WHERE book_id = ?
    `);
    const row = stmt.get(bookId) as any;
    return row ? this.rowToNotebook(row) : null;
  }

  // 删除笔记本
  delete(db: Database, bookId: string): void {
    const stmt = db.prepare(`
      DELETE FROM weread_notebook WHERE book_id = ?
    `);
    stmt.run(bookId);
  }

  // 将数据库行转换为 Notebook 对象
  private rowToNotebook(row: any): Notebook {
    return {
      metaData: {
        bookId: row.book_id,
        title: row.title,
        author: row.author,
        cover: row.cover,
        intro: row.intro,
        category: row.category,
        publisher: row.publisher,
        isbn: row.isbn,
        totalWords: row.total_words,
        rating: row.rating,
        bookType: row.book_type,
        publishTime: row.publish_time,
        noteCount: row.note_count,
        reviewCount: row.review_count,
        lastReadDate: row.last_read_date,
        url: row.url,
        pcUrl: row.pc_url,
        synckeys: {
          highlights: row.synckey_highlights,
          reviews: row.synckey_reviews,
          progress: row.synckey_progress,
        },
        readInfo: {
          readingProgress: row.reading_progress,
          readingTime: row.reading_time,
          readingBookDate: row.reading_book_date,
          finishedDate: row.finished_date,
          markedStatus: row.marked_status,
          totalReadDay: row.total_read_day,
          continueReadDays: row.continue_read_days,
        },
      },
      chapterHighlights: JSON.parse(row.chapter_highlights || "[]"),
      bookReview: JSON.parse(
        row.book_review || '{"chapterReviews":[],"bookReviews":[]}',
      ),
    };
  }
}

export default new WeReadNotebookTable();
