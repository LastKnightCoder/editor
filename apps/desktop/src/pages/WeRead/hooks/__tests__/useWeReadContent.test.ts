import { describe, expect, it } from "vitest";
import { convertNotebookToSlate } from "../useWeReadContent";
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

const extractText = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.map(extractText).join("");
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.values(record).map(extractText).join("");
  }
  return typeof value === "string" ? value : "";
};

describe("convertNotebookToSlate", () => {
  it("应渲染全书笔记内容而不是错误显示为空", () => {
    const slate = convertNotebookToSlate(
      createNotebook({
        bookReview: {
          chapterReviews: [],
          bookReviews: [
            {
              reviewId: "review-1",
              created: 1,
              createTime: "2024-01-02 10:00:00",
              content: "这是全书笔记内容",
              abstract: "摘要",
              type: 4,
            },
          ],
        },
      }),
    );

    const text = extractText(slate);
    expect(text).toContain("全书笔记");
    expect(text).toContain("这是全书笔记内容");
    expect(text).not.toContain("该书暂无划线和笔记");
  });
});
