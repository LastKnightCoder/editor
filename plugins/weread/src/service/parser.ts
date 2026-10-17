import dayjs from "dayjs";
import {
  Metadata,
  HighlightResponse,
  BookReviewResponse,
  ChapterResponse,
  Chapter,
  ChapterReview,
  Highlight,
  Review,
  BookReview,
  ChapterHighlightReview,
  WeReadNotebookSummary,
} from "./types";
import { md5 } from "./md5";
export const parseMetadata = (noteBook: WeReadNotebookSummary): Metadata => {
  const book = noteBook.book;
  const cover = book.cover.replace("/s_", "/t7_");
  const lastReadDate = dayjs(noteBook.sort * 1000).format("YYYY-MM-DD");
  return {
    bookId: noteBook.bookId,
    author: sanitizeAuthor(book.author),
    title: book.title,
    url: undefined,
    webUrl: getBookWebUrl(noteBook.bookId, book.title),
    cover,
    publishTime: "",
    noteCount: noteBook.noteCount,
    reviewCount: noteBook.reviewCount,
    bookmarkCount: noteBook.bookmarkCount,
    bookType: 0,
    lastReadDate,
  };
};

export const parseHighlights = (
  highlightData: HighlightResponse,
  reviewData: BookReviewResponse
): Highlight[] => {
  if (!highlightData?.updated || highlightData.updated.length === 0) {
    return [];
  }

  const linkedReviews = reviewData?.reviews?.map(item => item.review) ?? [];
  const chapters = highlightData?.chapters ?? [];

  return highlightData.updated.map(highlight => {
    const highlightRange = highlight.range;
    const highlightChapterUid = highlight.chapterUid;
    // 优先使用 range + chapterUid 组合匹配（更精确），其次使用 range 匹配
    const review =
      linkedReviews.find(
        reviewItem =>
          reviewItem.range === highlightRange && reviewItem.chapterUid === highlightChapterUid
      ) || linkedReviews.find(reviewItem => reviewItem.range === highlightRange);
    const reviewContent = review ? formatReviewContent(review.content) : undefined;

    const chapterInfo = chapters.find(chapter => chapter.chapterUid === highlight.chapterUid);

    return {
      bookmarkId: highlight.bookmarkId, // 保持原始格式用于 API 调用
      created: highlight.createTime,
      createTime: dayjs(highlight.createTime * 1000).format("YYYY-MM-DD HH:mm:ss"),
      chapterUid: highlight.chapterUid,
      chapterIdx: chapterInfo?.chapterIdx ?? highlight.chapterUid,
      chapterTitle: chapterInfo?.title ?? "未知章节",
      refMpReviewId: highlight.refMpReviewId,
      range: highlight.range,
      style: highlight.style,
      colorStyle: highlight.colorStyle,
      markText: addIndentToParagraphs(highlight.markText),
      reviewContent: reviewContent !== undefined ? addIndentToParagraphs(reviewContent) : undefined,
    };
  });
};

export const parseArticleHighlightReview = (
  chapters: Chapter[],
  highlights: Highlight[],
  reviews: Review[] = []
): ChapterHighlightReview[] => {
  const result: ChapterHighlightReview[] = [];

  // 使用索引来保持原始顺序，因为文章章节可能没有 chapterIdx
  chapters.forEach((chapter, index) => {
    const { refMpReviewId, title } = chapter;
    const chapterHighlights = highlights
      .filter(highlight => highlight.refMpReviewId === refMpReviewId)
      .sort(sortByRange);

    let chapterReviews: Review[] | undefined;
    if (chapterHighlights.length > 0 && reviews.length > 0) {
      chapterReviews = reviews
        .filter(review => refMpReviewId === review.refMpInfo?.reviewId)
        .sort(sortByRange);
    }

    if (chapterHighlights.length > 0) {
      result.push({
        chapterIdx: chapter.chapterIdx ?? index, // 使用原始索引作为后备
        chapterTitle: title,
        level: chapter.level,
        isMPChapter: chapter.isMPChapter,
        chapterReviews,
        highlights: chapterHighlights,
      });
    }
  });

  // 对于文章，按原始顺序排序（使用 chapterIdx 或原始索引）
  return result.sort((a, b) => (a.chapterIdx ?? 0) - (b.chapterIdx ?? 0));
};

export const parseChapterHighlightReview = (
  chapters: Chapter[],
  highlights: Highlight[],
  reviews: Review[] = []
): ChapterHighlightReview[] => {
  const result: ChapterHighlightReview[] = [];

  chapters.forEach(chapter => {
    const { chapterUid, chapterIdx, title } = chapter;
    const chapterHighlights = highlights
      .filter(highlight => highlight.chapterUid === chapterUid)
      .sort(sortByRange);

    // 获取该章节的评论（独立于高亮）
    const chapterReviews =
      reviews.length > 0
        ? reviews
            .filter(review => review.chapterUid === chapterUid && review.type === 1)
            .sort(sortByRange)
        : undefined;

    // 只添加有高亮或有章节评论的章节，避免产生空章节
    const hasContent =
      chapterHighlights.length > 0 || (chapterReviews && chapterReviews.length > 0);

    if (hasContent) {
      result.push({
        chapterUid,
        chapterIdx,
        chapterTitle: title,
        level: chapter.level,
        isMPChapter: chapter.isMPChapter,
        chapterReviews,
        highlights: chapterHighlights,
      });
    }
  });

  // 章节列表里找不到的划线（章节接口缺项、公众号文章等）归入「其他」，不丢弃
  const knownChapters = new Set(chapters.map(chapter => chapter.chapterUid));
  const orphanHighlights = highlights
    .filter(highlight => !knownChapters.has(highlight.chapterUid))
    .sort(sortByRange);
  if (orphanHighlights.length > 0) {
    result.push({
      chapterIdx: Number.MAX_SAFE_INTEGER,
      chapterTitle: "其他",
      level: 1,
      isMPChapter: 0,
      highlights: orphanHighlights,
    });
  }

  return result.sort((a, b) => (a.chapterIdx ?? 0) - (b.chapterIdx ?? 0));
};

export const parseChapterResp = (
  chapterResp: ChapterResponse | undefined,
  highlightResp: HighlightResponse
): Chapter[] => {
  if (!chapterResp) {
    return [];
  }

  if (
    Array.isArray(chapterResp.data) &&
    chapterResp.data.length > 0 &&
    Array.isArray(chapterResp.data[0].updated) &&
    chapterResp.data[0].updated.length > 0
  ) {
    return chapterResp.data[0].updated;
  }

  if (highlightResp.refMpInfos?.length) {
    return highlightResp.refMpInfos.map(mpInfo => ({
      refMpReviewId: mpInfo.reviewId,
      updateTime: mpInfo.createTime,
      title: mpInfo.title,
      isMPChapter: 1,
      level: 2,
    }));
  }

  return [];
};

/** 划线接口自带的章节（只含有划线的章节），无章节时退回公众号文章列表 */
export const chaptersFromHighlights = (highlightResp: HighlightResponse): Chapter[] => {
  if (highlightResp.chapters?.length) {
    return highlightResp.chapters.map(chapter => ({
      chapterUid: chapter.chapterUid,
      chapterIdx: chapter.chapterIdx,
      title: chapter.title,
      updateTime: 0,
      isMPChapter: 0,
      level: 1,
    }));
  }
  return parseChapterResp({ data: [] } as unknown as ChapterResponse, highlightResp);
};

export const parseReviews = (resp: BookReviewResponse): Review[] => {
  const parsed: Review[] = [];
  resp.reviews?.forEach(reviewData => {
    const review = reviewData.review;
    if (!review) {
      return;
    }
    const created = review.createTime;
    const createTime = dayjs(created * 1000).format("YYYY-MM-DD HH:mm:ss");

    const content = review.content;

    parsed.push({
      bookId: review.bookId,
      created,
      createTime,
      chapterUid: review.chapterUid,
      chapterTitle: review.chapterTitle || review.refMpInfo?.title,
      content,
      reviewId: review.reviewId, // 保持原始格式用于 API 调用
      mdContent: content,
      range: review.range,
      abstract: review.abstract,
      type: review.type,
      refMpInfo: review.refMpInfo,
    });
  });
  return parsed;
};

export const parseChapterReviews = (resp: BookReviewResponse): BookReview => {
  const reviews = parseReviews(resp);
  const chapterReviews = reviews.filter(review => review.type === 1).sort(sortByRange);

  const entireReviews = reviews.filter(review => review.type === 4);
  const chapterMap = new Map<number, ChapterReview>();

  chapterReviews.forEach(review => {
    const chapterUid = review.chapterUid ?? 0;
    if (!chapterMap.has(chapterUid)) {
      chapterMap.set(chapterUid, {
        chapterUid,
        chapterTitle: review.chapterTitle,
        reviews: [],
        chapterReviews: [],
      });
    }

    const chapterEntry = chapterMap.get(chapterUid)!;
    if (review.range) {
      chapterEntry.reviews.push(review);
    } else {
      chapterEntry.chapterReviews?.push(review);
    }
  });

  return {
    bookReviews: entireReviews,
    chapterReviews: Array.from(chapterMap.values()).sort(
      (a, b) => (a.chapterUid ?? 0) - (b.chapterUid ?? 0)
    ),
  };
};

const sanitizeAuthor = (author: string): string => {
  return author.replace(/\[(.*?)\]/g, "($1)");
};

// 不再处理 bookmarkId，保持原始格式用于 API 调用
// 之前的 sanitizeBookmarkId 会把 _ 和 ~ 替换成 -，导致 API 调用失败

const addIndentToParagraphs = (content?: string): string => {
  if (!content) {
    return "";
  }
  const paragraphs = content.split("\n");
  for (let i = 1; i < paragraphs.length; i += 1) {
    paragraphs[i] = `   ${paragraphs[i]}`;
  }
  return paragraphs.join("\n");
};

const formatReviewContent = (content: string): string => {
  if (!content) {
    return content;
  }
  return content;
};

const sortByRange = (a: Review | Highlight, b: Review | Highlight) => {
  const rangeA = extractRangeStart(a.range);
  const rangeB = extractRangeStart(b.range);
  return rangeA - rangeB;
};

const extractRangeStart = (range?: string): number => {
  if (!range) {
    return Number.MAX_SAFE_INTEGER;
  }
  const [start] = range.split("-");
  const parsed = parseInt(start, 10);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
};

const getLegacyPcUrl = (bookId: string): string => {
  const hash = md5(bookId);
  const [prefixFlag, segments] = getFa(bookId);
  let strSub = hash.substring(0, 3);
  strSub += prefixFlag;
  strSub += `2${hash.substring(hash.length - 2)}`;

  segments.forEach((segment, index) => {
    const len = segment.length.toString(16);
    strSub += len.length === 1 ? `0${len}` : len;
    strSub += segment;
    if (index < segments.length - 1) {
      strSub += "g";
    }
  });

  if (strSub.length < 20) {
    strSub += hash.substring(0, 20 - strSub.length);
  }

  strSub += md5(strSub).substring(0, 3);
  return `https://weread.qq.com/web/reader/${strSub}`;
};

export const getBookWebUrl = (bookId: string, title?: string): string | null => {
  if (title?.trim()) {
    return `https://weread.qq.com/web/search/books?keyword=${encodeURIComponent(title.trim())}`;
  }
  return getLegacyPcUrl(bookId);
};

const getFa = (id: string): [string, string[]] => {
  if (/^\d+$/.test(id)) {
    const segments: string[] = [];
    for (let i = 0; i < id.length; i += 9) {
      const block = id.slice(i, Math.min(i + 9, id.length));
      segments.push(parseInt(block, 10).toString(16));
    }
    return ["3", segments];
  }

  let data = "";
  for (let i = 0; i < id.length; i += 1) {
    data += id.charCodeAt(i).toString(16);
  }
  return ["4", [data]];
};
