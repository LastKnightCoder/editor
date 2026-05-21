import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import wereadNotebookTable from "../tables/weread-notebook";
import type { Notebook } from "@/types/weread";

describe("weread notebook table", () => {
  let db: Database.Database | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  it("应保存包含书签数量的微信读书笔记本", () => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE weread_notebook (
        book_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        author TEXT,
        cover TEXT,
        intro TEXT,
        category TEXT,
        publisher TEXT,
        isbn TEXT,
        total_words INTEGER,
        rating TEXT,
        book_type INTEGER,
        publish_time TEXT,
        note_count INTEGER DEFAULT 0,
        review_count INTEGER DEFAULT 0,
        bookmark_count INTEGER DEFAULT 0,
        archive_name TEXT,
        last_read_date TEXT,
        url TEXT,
        pc_url TEXT,
        reading_progress REAL DEFAULT 0,
        reading_time INTEGER DEFAULT 0,
        reading_book_date INTEGER DEFAULT 0,
        finished_date INTEGER DEFAULT 0,
        marked_status INTEGER DEFAULT 0,
        total_read_day INTEGER DEFAULT 0,
        continue_read_days INTEGER DEFAULT 0,
        reading_status INTEGER DEFAULT 0,
        synckey_highlights INTEGER,
        synckey_reviews INTEGER,
        synckey_progress INTEGER,
        chapter_highlights TEXT,
        book_review TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    const notebook: Notebook = {
      metaData: {
        bookId: "book-1",
        title: "测试书籍",
        author: "作者",
        cover: "",
        bookType: 0,
        publishTime: "",
        noteCount: 1,
        reviewCount: 2,
        bookmarkCount: 3,
        archiveName: "经济学",
        lastReadDate: "2026-05-21",
        url: "https://weread.qq.com",
        webUrl: "https://weread.qq.com/web/reader/book-1",
        readInfo: {
          readingProgress: 50,
          readingTime: 600,
          readingBookDate: 1,
          finishedDate: 0,
          markedStatus: 0,
          totalReadDay: 1,
          continueReadDays: 1,
        },
      },
      chapterHighlights: [],
      bookReview: {
        chapterReviews: [],
        bookReviews: [],
      },
    };

    expect(() => wereadNotebookTable.saveMany(db!, [notebook])).not.toThrow();

    const row = db
      .prepare(
        "SELECT book_id, bookmark_count, archive_name FROM weread_notebook",
      )
      .get() as {
      book_id: string;
      bookmark_count: number;
      archive_name: string;
    };
    expect(row).toEqual({
      book_id: "book-1",
      bookmark_count: 3,
      archive_name: "经济学",
    });

    const savedNotebook = wereadNotebookTable.getById(db!, "book-1");
    expect(savedNotebook?.metaData.archiveName).toBe("经济学");
  });
});
