export interface WeReadCookie {
  name: string;
  value: string;
}

export interface HighlightResponse {
  synckey: number;
  updated: Array<{
    bookId: string;
    bookVersion: number;
    chapterName: string;
    chapterUid: number;
    colorStyle: number;
    contextAbstract: string;
    markText: string;
    range: string;
    style: number;
    type: number;
    createTime: number;
    bookmarkId: string;
    refMpReviewId?: string;
  }>;
  removed: unknown[];
  chapters: Array<{
    bookId: string;
    chapterUid: number;
    chapterIdx: number;
    title: string;
  }>;
  refMpInfos?: Array<{
    reviewId: string;
    title: string;
    pic_url: string;
    createTime: number;
  }>;
  book: {
    bookId: string;
    version: number;
    format: string;
    soldout: number;
    bookStatus: number;
    cover: string;
    title: string;
    author: string;
  };
}

export interface BookReviewResponse {
  synckey: number;
  totalCount: number;
  reviews: Array<{
    review: {
      abstract: string;
      atUserVids: unknown[];
      bookId: string;
      bookVersion: number;
      refMpInfo?: {
        reviewId: string;
        title: string;
        pic_url: string;
        createTime: number;
      };
      chapterName: string;
      chapterUid: number;
      content: string;
      contextAbstract: string;
      htmlContent: string;
      range: string;
      createTime: number;
      title: string;
      type: number;
      reviewId: string;
      userVid: number;
      chapterIdx: number;
      chapterTitle: string;
      isLike: number;
      isReposted: number;
    };
  }>;
  removed: unknown[];
  hasMore: number;
}

export interface ChapterResponse {
  data: Array<{
    bookId: string;
    chapterUpdateTime: number;
    updated: Chapter[];
  }>;
}

export interface BookProgressResponse {
  bookId: string;
  book: {
    bookVersion: number;
    chapterUid: number;
    chapterOffset: number;
    chapterIdx: number;
    updateTime: number;
    synckey: number;
    readingTime: number;
    progress: number;
    startReadingTime: number;
    finishTime: number;
  };
  timestamp: number;
}

export interface BookReadInfoResponse {
  finishedBookCount: number;
  finishedBookIndex: number;
  finishedDate: number;
  readingBookCount: number;
  readingBookDate: number;
  readingProgress: number;
  readingReviewId: string;
  canCancelReadstatus: number;
  markedStatus: number;
  readingTime: number;
  totalReadDay: number;
  recordReadingTime: number;
  continueReadDays: number;
  continueBeginDate: number;
  continueEndDate: number;
  showSummary: number;
  showDetail: number;
  readDetail: {
    totalReadingTime: number;
    totalReadDay: number;
    continueReadDays: number;
    continueBeginDate: number;
    continueEndDate: number;
    beginReadingDate: number;
    lastReadingDate: number;
    longestReadingDate: number;
    avgReadingTime: number;
    longestReadingTime: number;
    data: Array<{
      readDate: number;
      readTime: number;
    }>;
  };
  bookInfo: {
    bookId: string;
    title: string;
    author: string;
    intro: string;
    cover: string;
    version: number;
    format: string;
    type: number;
    soldout: number;
    bookStatus: number;
    payType: number;
    finished: number;
    publishTime: string;
    lastChapterIdx: number;
    isbn: string;
    publisher: string;
    totalWords: number;
    bookSize: number;
  };
}

export interface BookDetailResponse {
  bookId: string;
  encodeId?: string;
  title: string;
  author: string;
  cover: string;
  version: number;
  format: string;
  type: number;
  price: number;
  originalPrice: number;
  soldout: number;
  bookStatus: number;
  payType: number;
  intro: string;
  centPrice: number;
  finished: number;
  maxFreeChapter: number;
  free: number;
  publishTime: string;
  category: string;
  lastChapterIdx: number;
  paperBook?: { skuId: string };
  isbn: string;
  publisher: string;
  totalWords: number;
  bookSize: number;
  ratingCount: number;
  newRating: number;
  newRatingCount: number;
}

export interface Chapter {
  chapterUid?: number;
  chapterIdx?: number;
  updateTime: number;
  title: string;
  isMPChapter: number;
  refMpReviewId?: string;
  level: number;
}

export interface Notebook {
  metaData: Metadata;
  chapterHighlights: ChapterHighlightReview[];
  bookReview: BookReview;
}

export type BookType = "book" | "article";

export interface Metadata {
  bookId: string;
  encodeId?: string;
  author: string;
  title: string;
  url: string;
  pcUrl?: string;
  cover: string;
  bookType: number;
  publishTime: string;
  noteCount: number;
  reviewCount: number;
  lastReadDate: string;
  duplicate?: boolean;
  intro?: string;
  isbn?: string;
  category?: string;
  publisher?: string;
  totalWords?: number;
  rating?: string;
  synckeys?: {
    highlights?: number;
    reviews?: number;
    progress?: number;
  };
  readInfo?: {
    markedStatus?: number;
    readingTime: number;
    totalReadDay?: number;
    continueReadDays?: number;
    readingBookCount?: number;
    readingBookDate: number;
    finishedBookCount?: number;
    finishedBookIndex?: number;
    finishedDate: number;
    readingProgress: number;
  };
  archiveName?: string; // 书架分类名称
}

export interface Highlight {
  bookmarkId: string;
  created: number;
  createTime: string;
  chapterUid: number;
  chapterIdx: number;
  chapterTitle: string;
  markText: string;
  style: number;
  colorStyle: number;
  reviewContent?: string | null;
  range: string;
  refMpReviewId?: string;
}

export interface BookReview {
  chapterReviews: ChapterReview[];
  bookReviews: Review[];
}

export interface ChapterReview {
  chapterUid: number;
  chapterTitle?: string;
  chapterReviews?: Review[];
  reviews: Review[];
}

export interface Review {
  reviewId: string;
  bookId?: string;
  chapterUid?: number;
  chapterTitle?: string;
  created: number;
  createTime: string;
  content: string;
  mdContent?: string | null;
  abstract?: string;
  range?: string;
  type: number;
  refMpInfo?: {
    reviewId: string;
    title: string;
    pic_url: string;
    createTime: number;
  };
}

export interface ChapterHighlightReview {
  chapterUid?: number;
  chapterIdx?: number;
  chapterTitle: string;
  level: number;
  isMPChapter: number;
  highlights?: Highlight[];
  chapterReviews?: Review[];
}

export interface DailyNoteReference {
  metaData: Metadata;
  refBlocks: RefBlockDetail[];
}

export interface RefBlockDetail {
  refBlockId: string;
  createTime: number;
}

export interface AnnotationFile {
  bookId?: string;
  noteCount: number;
  reviewCount: number;
  new: boolean;
  path?: string;
}

export interface WeReadNotebookSummary {
  book: {
    bookId: string;
    title: string;
    author: string;
    cover: string;
    url: string;
    publishTime: string;
    type: number;
  };
  sort: number;
  noteCount: number;
  reviewCount: number;
  lastReadDate?: string;
}

export interface WeReadLoginResult {
  cookies: WeReadCookie[];
  userName: string;
  userVid: string;
}

export interface WeReadHttpRequestPayload {
  path: string;
  method?: "GET" | "POST" | "HEAD";
  body?: unknown;
  headers?: Record<string, string>;
  cookies?: WeReadCookie[];
  responseType?: "json" | "text" | "none";
}

export interface WeReadHttpResponse<T = unknown> {
  status: number;
  ok: boolean;
  data: T | null;
  cookies: WeReadCookie[];
}

export interface ShelfArchive {
  archiveId: number;
  name: string;
  bookIds: string[];
}

export interface ShelfBook {
  bookId: string;
  title: string;
  author: string;
  cover: string;
  version: number;
  format: string;
  type: number;
  category?: string;
  totalWords?: number;
}

export interface ShelfData {
  archives: ShelfArchive[];
  books: Map<string, ShelfBook>;
  bookArchiveMap: Map<string, string>; // bookId -> archiveName
}
