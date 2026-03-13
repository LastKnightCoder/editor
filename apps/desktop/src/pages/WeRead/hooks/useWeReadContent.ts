import { useMemo } from "react";
import type { Descendant } from "slate";
import type { Notebook, Highlight, Review } from "@/types/weread";
import type {
  WeReadMetadataElement,
  WeReadChapterElement,
  WeReadBookmarkElement,
  WeReadHighlightStyle,
  WeReadColorStyle,
} from "../types/elements";
import { importFromMarkdown } from "@/utils/markdown";

interface MergedBookmark {
  bookmarkId: string;
  reviewId?: string;
  bookId: string;
  chapterUid: number;
  range: string;
  markText: string;
  reviewContent?: string;
  style: WeReadHighlightStyle;
  colorStyle: WeReadColorStyle;
  bookVersion?: number;
}

/**
 * 将微信读书的 Notebook 数据转换为包含自定义扩展元素的 Slate 结构（非 hook 版本）
 */
export const convertNotebookToSlate = (
  notebook: Notebook | null,
): Descendant[] => {
  if (!notebook) {
    return [
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "" }],
      },
    ];
  }

  const { metaData, chapterHighlights, bookReview } = notebook;
  const content: Descendant[] = [];

  // 1. 添加书籍元信息元素
  const metadataElement: WeReadMetadataElement = {
    type: "weread-metadata",
    metaData,
    children: [{ type: "formatted", text: "" }],
  };
  content.push(metadataElement as any);

  // 2. 处理章节和书签
  if (chapterHighlights?.length) {
    chapterHighlights.forEach((chapter) => {
      // 合并相同 range 的高亮和评论
      const mergedBookmarks = mergeHighlightsAndReviews(
        chapter.highlights || [],
        chapter.chapterReviews || [],
        metaData.bookId,
        chapter.chapterUid || 0,
      );

      // 如果该章节有书签，创建章节元素
      if (mergedBookmarks.length > 0) {
        const chapterElement: WeReadChapterElement = {
          type: "weread-chapter",
          chapterTitle: chapter.chapterTitle,
          chapterUid: chapter.chapterUid || 0,
          chapterIdx: chapter.chapterIdx || 0,
          level: chapter.level || 0,
          children: mergedBookmarks.map((bookmark) =>
            createBookmarkElement(bookmark),
          ),
        };
        content.push(chapterElement as any);
      }
    });
  }

  if (bookReview.bookReviews?.length) {
    content.push(...createBookReviewBlocks(bookReview.bookReviews));
  }

  // 如果没有内容，添加一个空段落
  if (content.length === 1) {
    content.push({
      type: "paragraph",
      children: [{ type: "formatted", text: "该书暂无划线和笔记" }],
    });
  }

  return content;
};

/**
 * 将微信读书的 Notebook 数据转换为包含自定义扩展元素的 Slate 结构（hook 版本）
 */
export const useWeReadContent = (notebook: Notebook | null): Descendant[] => {
  return useMemo(() => convertNotebookToSlate(notebook), [notebook]);
};

/**
 * 合并相同 range 的高亮和评论
 */
function mergeHighlightsAndReviews(
  highlights: Highlight[],
  reviews: Review[],
  bookId: string,
  chapterUid: number,
): MergedBookmark[] {
  const mergedMap = new Map<string, MergedBookmark>();

  // 首先添加所有高亮
  highlights.forEach((highlight) => {
    if (!highlight.range) return;

    mergedMap.set(highlight.range, {
      bookmarkId: highlight.bookmarkId,
      bookId,
      chapterUid,
      range: highlight.range,
      markText: highlight.markText,
      style: (highlight.style ?? 0) as WeReadHighlightStyle,
      colorStyle: (highlight.colorStyle ?? 5) as WeReadColorStyle,
      reviewContent: highlight.reviewContent || undefined,
    });
  });

  // 然后合并评论（如果 range 相同）
  reviews.forEach((review) => {
    if (!review.range) return;

    const existing = mergedMap.get(review.range);
    if (existing) {
      // 合并到已有的高亮
      existing.reviewId = review.reviewId;
      existing.reviewContent = review.content || review.mdContent || undefined;
    } else {
      // 创建一个新的书签（只有评论，没有高亮）
      // 注意：这种情况理论上不应该出现，因为评论总是基于高亮
      // 但我们还是处理一下，创建一个默认的高亮样式
      mergedMap.set(review.range, {
        bookmarkId: review.range, // 使用 range 作为临时 ID
        reviewId: review.reviewId,
        bookId,
        chapterUid,
        range: review.range,
        markText: review.abstract || "",
        reviewContent: review.content || review.mdContent || undefined,
        style: 0,
        colorStyle: 5,
      });
    }
  });

  // 转换为数组并排序（按 range 的起始位置）
  const bookmarks = Array.from(mergedMap.values()).sort((a, b) => {
    const rangeA = parseInt(a.range.split("-")[0], 10);
    const rangeB = parseInt(b.range.split("-")[0], 10);
    return rangeA - rangeB;
  });

  return bookmarks;
}

/**
 * 创建书签元素
 */
function createBookmarkElement(
  bookmark: MergedBookmark,
): WeReadBookmarkElement {
  let reviewDescendants: any[] | undefined;

  // 如果有评论内容，尝试反序列化为 Descendant[]
  if (bookmark.reviewContent) {
    try {
      reviewDescendants = importFromMarkdown(bookmark.reviewContent);
    } catch (error) {
      console.error("Failed to parse review content as Markdown:", error);
      // 如果解析失败，创建一个简单的段落
      reviewDescendants = [
        {
          type: "paragraph",
          children: [{ type: "formatted", text: bookmark.reviewContent }],
        },
      ];
    }
  }

  return {
    type: "weread-bookmark",
    bookmarkId: bookmark.bookmarkId,
    reviewId: bookmark.reviewId,
    bookId: bookmark.bookId,
    chapterUid: bookmark.chapterUid,
    range: bookmark.range,
    markText: bookmark.markText,
    reviewContent: bookmark.reviewContent,
    reviewDescendants,
    style: bookmark.style,
    colorStyle: bookmark.colorStyle,
    bookVersion: bookmark.bookVersion,
    children: [{ type: "formatted", text: "" }],
  };
}

function createBookReviewBlocks(reviews: Review[]): Descendant[] {
  const markdownLines: string[] = ["## 全书笔记", ""];

  reviews.forEach((review, index) => {
    markdownLines.push(`### 笔记 ${index + 1}`);
    if (review.abstract) {
      markdownLines.push(`> ${review.abstract}`);
    }
    if (review.content) {
      markdownLines.push(review.content);
    } else if (review.mdContent) {
      markdownLines.push(review.mdContent);
    }
    markdownLines.push("");
  });

  return importFromMarkdown(markdownLines.join("\n"));
}
