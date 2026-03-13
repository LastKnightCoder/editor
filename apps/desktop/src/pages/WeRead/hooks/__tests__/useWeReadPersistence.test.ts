import { describe, expect, it } from "vitest";
import {
  hasNotebookDetailContent,
  preferNonEmptyNotebookDetail,
} from "../useWeReadPersistence";
import type { Notebook } from "@/types/weread";

const createNotebook = (overrides: Partial<Notebook> = {}): Notebook => ({
  metaData: {
    bookId: "book-1",
    author: "作者",
    title: "测试书籍",
    url: "https://weread.qq.com",
    cover: "https://example.com/cover.jpg",
    bookType: 1,
    publishTime: "2024-01-01",
    noteCount: 1,
    reviewCount: 1,
    lastReadDate: "2024-01-02",
  },
  chapterHighlights: [],
  bookReview: {
    chapterReviews: [],
    bookReviews: [],
  },
  ...overrides,
});

describe("useWeReadPersistence helpers", () => {
  it("应识别已有全书笔记的 notebook 详情内容", () => {
    const notebook = createNotebook({
      bookReview: {
        chapterReviews: [],
        bookReviews: [
          {
            reviewId: "review-1",
            created: 1,
            createTime: "2024-01-01 10:00:00",
            content: "已有缓存的全书笔记",
            type: 4,
          },
        ],
      },
    });

    expect(hasNotebookDetailContent(notebook)).toBe(true);
  });

  it("应在新结果为空时保留已有详情内容", () => {
    const current = createNotebook({
      bookReview: {
        chapterReviews: [],
        bookReviews: [
          {
            reviewId: "review-1",
            created: 1,
            createTime: "2024-01-01 10:00:00",
            content: "已有缓存的全书笔记",
            type: 4,
          },
        ],
      },
    });
    const next = createNotebook();

    expect(preferNonEmptyNotebookDetail(current, next)).toBe(current);
  });
});
