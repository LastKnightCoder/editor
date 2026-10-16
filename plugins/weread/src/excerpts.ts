/**
 * 微信读书 → Tau 摘录：把一本书的划线与想法展开成摘录条目。纯函数。
 *
 * externalId（bookId:bookmarkId / bookId:review:reviewId）、引文规范化与合并口径是 Tau 中已有引用的身份，
 * 改动会让旧摘录被软删除、引用失效，只能在有迁移方案时调整。
 *
 * 合并口径与单书页 buildBookNotes 一致：同一 range 的想法并到划线上；只有想法、没有划线的以想法摘录
 * （abstract）作原文；没有原文的章节想法与整书书评不是摘录。
 */

import type { PluginExcerptItem } from "@tau/plugins";
import type { ChapterHighlightReview, Review } from "./service/types";

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
  chapters: ChapterHighlightReview[]
): PluginExcerptItem[] {
  const result: PluginExcerptItem[] = [];
  for (const chapter of chapters) {
    const chapterTitle = chapter.chapterTitle || "";
    const byRange = new Map<string, PluginExcerptItem>();
    for (const highlight of chapter.highlights ?? []) {
      const quote = normalizeWeReadText(highlight.markText);
      if (!highlight.bookmarkId || !quote) continue;
      const excerpt: PluginExcerptItem = {
        externalId: `${bookId}:${highlight.bookmarkId}`,
        quote,
        note: normalizeWeReadText(highlight.reviewContent),
        location: chapterTitle || highlight.chapterTitle || "",
        anchor: {
          chapterUid: highlight.chapterUid ?? chapter.chapterUid ?? 0,
          chapterIdx: highlight.chapterIdx ?? chapter.chapterIdx ?? 0,
          chapterTitle: chapterTitle || highlight.chapterTitle || "",
          range: highlight.range ?? "",
        },
        ...(highlight.colorStyle != null ? { color: String(highlight.colorStyle) } : {}),
        ...(highlight.created ? { time: highlight.created * 1000 } : {}),
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
      const excerpt: PluginExcerptItem = {
        externalId: `${bookId}:review:${review.reviewId}`,
        quote,
        note: text,
        location: chapterTitle,
        anchor: {
          chapterUid: review.chapterUid ?? chapter.chapterUid ?? 0,
          chapterIdx: chapter.chapterIdx ?? 0,
          chapterTitle,
          range: review.range,
        },
        ...(review.created ? { time: review.created * 1000 } : {}),
      };
      result.push(excerpt);
      byRange.set(review.range, excerpt);
    }
  }
  return result;
}
