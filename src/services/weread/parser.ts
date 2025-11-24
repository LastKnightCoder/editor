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
  DailyNoteReference,
  RefBlockDetail,
  Notebook,
  WeReadNotebookSummary,
} from "@/types/weread";
import { md5 } from "./md5";

export interface WeReadParserOptions {
  convertTagsToBiLinks?: boolean;
  showEmptyChapterTitle?: boolean;
}

export const parseMetadata = (noteBook: WeReadNotebookSummary): Metadata => {
  const book = noteBook.book;
  const cover = book.cover.replace("/s_", "/t7_");
  const lastReadDate = dayjs(noteBook.sort * 1000).format("YYYY-MM-DD");
  return {
    bookId: book.bookId,
    author: sanitizeAuthor(book.author),
    title: book.title,
    url: book.url,
    cover,
    publishTime: book.publishTime,
    noteCount: noteBook.noteCount,
    reviewCount: noteBook.reviewCount,
    bookType: book.type,
    lastReadDate,
    pcUrl: getPcUrl(book.bookId),
  };
};

export const parseHighlights = (
  highlightData: HighlightResponse,
  reviewData: BookReviewResponse,
  options: WeReadParserOptions = {},
): Highlight[] => {
  if (!highlightData?.updated || highlightData.updated.length === 0) {
    return [];
  }

  const linkedReviews = reviewData?.reviews?.map((item) => item.review) ?? [];
  const chapters = highlightData?.chapters ?? [];

  return highlightData.updated.map((highlight) => {
    const highlightRange = highlight.range;
    const review = linkedReviews.find(
      (reviewItem) => reviewItem.range === highlightRange,
    );
    const reviewContent = review
      ? formatReviewContent(review.content, options)
      : undefined;

    const chapterInfo = chapters.find(
      (chapter) => chapter.chapterUid === highlight.chapterUid,
    );

    return {
      bookmarkId: sanitizeBookmarkId(highlight.bookmarkId),
      created: highlight.createTime,
      createTime: dayjs(highlight.createTime * 1000).format(
        "YYYY-MM-DD HH:mm:ss",
      ),
      chapterUid: highlight.chapterUid,
      chapterIdx: chapterInfo?.chapterIdx ?? highlight.chapterUid,
      chapterTitle: chapterInfo?.title ?? "未知章节",
      refMpReviewId: highlight.refMpReviewId,
      range: highlight.range,
      style: highlight.style,
      colorStyle: highlight.colorStyle,
      markText: addIndentToParagraphs(highlight.markText),
      reviewContent:
        reviewContent !== undefined
          ? addIndentToParagraphs(reviewContent)
          : undefined,
    };
  });
};

export const parseArticleHighlightReview = (
  chapters: Chapter[],
  highlights: Highlight[],
  reviews: Review[] = [],
): ChapterHighlightReview[] => {
  const result: ChapterHighlightReview[] = [];

  chapters.forEach((chapter) => {
    const { refMpReviewId, title } = chapter;
    const chapterHighlights = highlights
      .filter((highlight) => highlight.refMpReviewId === refMpReviewId)
      .sort(sortByRange);

    let chapterReviews: Review[] | undefined;
    if (chapterHighlights.length > 0 && reviews.length > 0) {
      chapterReviews = reviews
        .filter((review) => refMpReviewId === review.refMpInfo?.reviewId)
        .sort(sortByRange);
    }

    if (chapterHighlights.length > 0) {
      result.push({
        chapterTitle: title,
        level: chapter.level,
        isMPChapter: chapter.isMPChapter,
        chapterReviews,
        highlights: chapterHighlights,
      });
    }
  });

  return result.sort((a, b) => (a.chapterIdx ?? 0) - (b.chapterIdx ?? 0));
};

export const parseChapterHighlightReview = (
  chapters: Chapter[],
  highlights: Highlight[],
  reviews: Review[] = [],
  options: WeReadParserOptions = {},
): ChapterHighlightReview[] => {
  const result: ChapterHighlightReview[] = [];

  chapters.forEach((chapter) => {
    const { chapterUid, chapterIdx, title } = chapter;
    const chapterHighlights = highlights
      .filter((highlight) => highlight.chapterUid === chapterUid)
      .sort(sortByRange);

    let chapterReviews: Review[] | undefined;
    if (chapterHighlights.length > 0 && reviews.length > 0) {
      chapterReviews = reviews
        .filter(
          (review) => review.chapterUid === chapterUid && review.type === 1,
        )
        .sort(sortByRange);
    }

    const shouldInclude =
      chapterHighlights.length > 0 || options.showEmptyChapterTitle === true;
    if (shouldInclude) {
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

  return result.sort((a, b) => (a.chapterIdx ?? 0) - (b.chapterIdx ?? 0));
};

export const parseChapterResp = (
  chapterResp: ChapterResponse | undefined,
  highlightResp: HighlightResponse,
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
    return highlightResp.refMpInfos.map((mpInfo) => ({
      refMpReviewId: mpInfo.reviewId,
      updateTime: mpInfo.createTime,
      title: mpInfo.title,
      isMPChapter: 1,
      level: 2,
    }));
  }

  return [];
};

export const parseDailyNoteReferences = (
  notebooks: Notebook[],
  currentDate = dayjs(),
): DailyNoteReference[] => {
  const today = currentDate.format("YYYYMMDD");
  const references: DailyNoteReference[] = [];

  notebooks.forEach((notebook) => {
    const todaysHighlights =
      notebook.chapterHighlights
        .flatMap((chapter) => chapter.highlights ?? [])
        .filter((highlight) => {
          const created = dayjs(highlight.created * 1000).format("YYYYMMDD");
          return created === today;
        }) ?? [];

    if (todaysHighlights.length > 0) {
      const refBlocks: RefBlockDetail[] = todaysHighlights.map((highlight) => ({
        refBlockId: highlight.bookmarkId,
        createTime: highlight.created,
      }));

      references.push({
        metaData: notebook.metaData,
        refBlocks,
      });
    }
  });

  return references;
};

export const parseReviews = (
  resp: BookReviewResponse,
  options: WeReadParserOptions = {},
): Review[] => {
  const convert = options.convertTagsToBiLinks === true;
  const parsed: Review[] = [];
  resp.reviews?.forEach((reviewData) => {
    const review = reviewData.review;
    if (!review) {
      return;
    }
    const created = review.createTime;
    const createTime = dayjs(created * 1000).format("YYYY-MM-DD HH:mm:ss");

    const content = convert
      ? convertTagToBiLink(review.content)
      : review.content;

    parsed.push({
      bookId: review.bookId,
      created,
      createTime,
      chapterUid: review.chapterUid,
      chapterTitle: review.chapterTitle || review.refMpInfo?.title,
      content,
      reviewId: sanitizeBookmarkId(review.reviewId),
      mdContent: content,
      range: review.range,
      abstract: review.abstract,
      type: review.type,
      refMpInfo: review.refMpInfo,
    });
  });
  return parsed;
};

export const parseChapterReviews = (
  resp: BookReviewResponse,
  options: WeReadParserOptions = {},
): BookReview => {
  const reviews = parseReviews(resp, options);
  const chapterReviews = reviews
    .filter((review) => review.type === 1)
    .sort(sortByRange);

  const entireReviews = reviews.filter((review) => review.type === 4);
  const chapterMap = new Map<number, ChapterReview>();

  chapterReviews.forEach((review) => {
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
      (a, b) => (a.chapterUid ?? 0) - (b.chapterUid ?? 0),
    ),
  };
};

const sanitizeAuthor = (author: string): string => {
  return author.replace(/\[(.*?)\]/g, "($1)");
};

const sanitizeBookmarkId = (bookmarkId: string): string => {
  return bookmarkId?.replace(/[_~]/g, "-");
};

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

const convertTagToBiLink = (content: string): string => {
  return content.replace(/(^|\s)#([^\s#]+)/g, (_match, prefix, tag) => {
    return `${prefix}[[${tag}]]`;
  });
};

const formatReviewContent = (
  content: string,
  options: WeReadParserOptions,
): string => {
  if (!content) {
    return content;
  }
  return options.convertTagsToBiLinks ? convertTagToBiLink(content) : content;
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

export const getPcUrl = (bookId: string): string => {
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
