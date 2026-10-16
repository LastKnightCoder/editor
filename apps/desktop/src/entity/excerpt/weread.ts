/**
 * 微信读书 → 摘录：把一本书缓存的 chapter_highlights 展开成摘录（KL-033）。纯函数，主进程写库与测试共用。
 *
 * 合并口径与单书页 buildBookNotes 一致：同一 range 的想法并到划线上；只有想法、没有划线的以想法摘录
 * （abstract）作原文；没有原文的章节想法与整书书评不是摘录。
 */

import type { ChapterHighlightReview, Review } from "@/types/weread";
import type { ExcerptInput } from "./types";

/** 按行去掉首尾空白与空行：库里的 markText 第二段起被加了缩进（addIndentToParagraphs），这里还原 */
export const normalizeWeReadText = (text: string | null | undefined): string =>
  (text ?? "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .join("\n");

const reviewText = (review: Review) => normalizeWeReadText(review.content || review.mdContent);

export function expandWeReadExcerpts(
  bookId: string,
  chapters: ChapterHighlightReview[],
  url: string | null = null
): ExcerptInput[] {
  const result: ExcerptInput[] = [];
  for (const chapter of chapters) {
    const chapterTitle = chapter.chapterTitle || "";
    const byRange = new Map<string, ExcerptInput>();
    for (const highlight of chapter.highlights ?? []) {
      const quote = normalizeWeReadText(highlight.markText);
      if (!highlight.bookmarkId || !quote) continue;
      const excerpt: ExcerptInput = {
        externalId: `${bookId}:${highlight.bookmarkId}`,
        quote,
        note: normalizeWeReadText(highlight.reviewContent),
        location: chapterTitle || highlight.chapterTitle || "",
        url,
        anchor: {
          chapterUid: highlight.chapterUid ?? chapter.chapterUid ?? 0,
          chapterIdx: highlight.chapterIdx ?? chapter.chapterIdx ?? 0,
          chapterTitle: chapterTitle || highlight.chapterTitle || "",
          range: highlight.range ?? "",
        },
        color: highlight.colorStyle != null ? String(highlight.colorStyle) : null,
        sourceTime: highlight.created ? highlight.created * 1000 : null,
      };
      result.push(excerpt);
      if (highlight.range) byRange.set(highlight.range, excerpt);
    }
    for (const review of chapter.chapterReviews ?? []) {
      if (!review.range || !review.reviewId) continue;
      const text = reviewText(review);
      const hit = byRange.get(review.range);
      if (hit) {
        if (!hit.note) hit.note = text;
        continue;
      }
      const quote = normalizeWeReadText(review.abstract);
      if (!quote) continue;
      const excerpt: ExcerptInput = {
        externalId: `${bookId}:review:${review.reviewId}`,
        quote,
        note: text,
        location: chapterTitle,
        url,
        anchor: {
          chapterUid: review.chapterUid ?? chapter.chapterUid ?? 0,
          chapterIdx: chapter.chapterIdx ?? 0,
          chapterTitle,
          range: review.range,
        },
        color: null,
        sourceTime: review.created ? review.created * 1000 : null,
      };
      result.push(excerpt);
      byRange.set(review.range, excerpt);
    }
  }
  return result;
}
