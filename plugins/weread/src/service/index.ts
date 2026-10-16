import dayjs from "dayjs";
import {
  chaptersFromHighlights,
  parseChapterHighlightReview,
  parseChapterResp,
  parseChapterReviews,
  parseHighlights,
  parseMetadata,
  parseReviews,
  getBookWebUrl,
} from "./parser";
import { WeReadNotLoggedInError, WeReadRateLimitError, WeReadSessionExpiredError } from "./errors";
import type {
  Metadata,
  Notebook,
  WeReadNotebookSummary,
  BookDetailResponse,
  BookProgressResponse,
  HighlightResponse,
  BookReviewResponse,
  ChapterResponse,
  Chapter,
  ShelfData,
} from "./types";

const WEREAD_GATEWAY_URL = "https://i.weread.qq.com/api/agent/gateway";
const SKILL_VERSION = "1.0.4";
const METADATA_SYNC_CONCURRENCY = 3;
const METADATA_SYNC_MAX_ATTEMPTS = 3;
const METADATA_SYNC_BATCH_DELAY_MS = 500;
const METADATA_SYNC_RETRY_BASE_DELAY_MS = 1000;

type GatewayEnvelope<T> = T & {
  errcode?: number;
  errmsg?: string;
  upgrade_info?: {
    message?: string;
    latest_version?: string;
    current_version?: string;
    upgrade_url?: string;
  };
};

type WeReadBookDetail = BookDetailResponse & {
  wordCount?: number;
};

type ShelfSyncResponse = {
  books?: Array<{
    bookId: string;
    title: string;
    author: string;
    cover: string;
    category?: string;
    readUpdateTime?: number;
    finishReading?: number;
    intro?: string;
    publishTime?: string;
    publisher?: string;
    totalWords?: number;
  }>;
  albums?: Array<{
    albumInfo: {
      albumId: string;
      name: string;
      authorName: string;
      cover: string;
      intro?: string;
      updateTime?: number;
      trackCount?: number;
      finish?: number;
      finishStatus?: string;
    };
    albumInfoExtra?: {
      lectureReadUpdateTime?: number;
    };
  }>;
  mp?: Record<string, unknown> | null;
  archive?: Array<{
    archiveId?: number;
    name: string;
    bookIds: string[];
    albumIds?: string[];
  }>;
};

type NotebookOverviewResponse = {
  books: Array<{
    bookId: string;
    book: {
      title: string;
      author: string;
      cover: string;
    };
    sort: number;
    reviewCount: number;
    noteCount: number;
    bookmarkCount: number;
    readingProgress?: number;
    markedStatus?: number;
  }>;
  hasMore?: number;
  totalBookCount?: number;
  totalNoteCount?: number;
};

type MyReviewListResponse = {
  reviews: Array<{
    review: {
      reviewId: string;
      bookId: string;
      chapterUid: number;
      chapterName?: string;
      chapterTitle?: string;
      content: string;
      abstract?: string;
      range?: string;
      createTime: number;
      type: number;
    };
  }>;
  totalCount?: number;
  hasMore?: number;
  synckey?: number;
};

export interface MetadataListResult {
  metadataList: Metadata[];
  failedBookIds: string[];
  bookArchiveInfo: Record<
    string,
    {
      archiveId?: number;
      archiveName?: string;
    }
  >;
}

export interface IncrementalSyncResult extends MetadataListResult {
  /** 完整远端成员清单，不受逐本详情补拉成功与否影响。 */
  presentBookIds: string[];
  /** 已不在书架与笔记本里的书 */
  removedBookIds: string[];
  /** 本次逐本补拉详情的书数 */
  requested: number;
  /** 有笔记的书的笔记指纹（笔记本概览的 sort 与笔记总数）；不在其中的书没有笔记 */
  noteFingerprints: Record<string, NoteFingerprint>;
}

/** 笔记指纹：存进 synckeys.highlights（sort）与 synckeys.reviews（笔记总数），变化即重新拉划线 */
export interface NoteFingerprint {
  sort: number;
  count: number;
}

export interface MetadataSyncProgress {
  completed: number;
  total: number;
}

export interface MetadataSyncOptions {
  onProgress?: (progress: MetadataSyncProgress) => void;
}

export { WeReadRateLimitError } from "./errors";

export interface WeReadClientOptions {
  fetch: typeof globalThis.fetch;
  /** 每次请求时读取，配置变化后立即生效 */
  getApiKey: () => string;
}

export class WeReadClient {
  constructor(private readonly options: WeReadClientOptions) {}

  /** 校验 API Key：成功返回，失败抛出带原因的错误 */
  async validateSession(): Promise<void> {
    await this.gatewayRequest<Record<string, unknown>>("/_list");
  }

  async getNotebookSummaries(): Promise<WeReadNotebookSummary[]> {
    const books: WeReadNotebookSummary[] = [];
    let lastSort: number | undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await this.gatewayRequest<NotebookOverviewResponse>("/user/notebooks", {
        count: 100,
        ...(typeof lastSort === "number" ? { lastSort } : {}),
      });

      if (!Array.isArray(response.books)) throw new Error("笔记书单不完整，请重新同步");
      const pageBooks = response.books;
      books.push(
        ...pageBooks.map(book => ({
          bookId: book.bookId,
          book: {
            title: book.book.title,
            author: book.book.author,
            cover: book.book.cover,
          },
          sort: book.sort,
          noteCount: book.noteCount ?? 0,
          reviewCount: book.reviewCount ?? 0,
          bookmarkCount: book.bookmarkCount ?? 0,
          readingProgress: book.readingProgress,
          markedStatus: book.markedStatus,
          lastReadDate: dayjs(book.sort * 1000).format("YYYY-MM-DD"),
        }))
      );

      hasMore = response.hasMore === 1;
      if (hasMore) {
        const next = pageBooks.at(-1)?.sort;
        if (
          typeof next !== "number" ||
          !Number.isFinite(next) ||
          next < 0 ||
          (lastSort !== undefined && next >= lastSort)
        )
          throw new Error("笔记书单分页未完成，请重新同步");
        lastSort = next;
      }
    }

    return books;
  }

  async fetchMetadataByBookIds(
    bookIds: string[],
    archiveInfo: Record<string, { archiveId?: number; archiveName?: string }> = {},
    options: MetadataSyncOptions = {}
  ): Promise<MetadataListResult> {
    const notebookSummaries = await this.getNotebookSummaries();
    const summaryMap = new Map(notebookSummaries.map(summary => [summary.bookId, summary]));
    const metadataInputs = bookIds.map(bookId => {
      const summary = summaryMap.get(bookId);
      const baseMeta = summary ? parseMetadata(summary) : null;
      return { bookId, baseMeta };
    });

    const { metadataList, failedBookIds } = await this.enrichMetadataInputsWithProgress(
      metadataInputs,
      bookId => archiveInfo[bookId],
      options
    );

    return {
      metadataList,
      failedBookIds,
      bookArchiveInfo: archiveInfo,
    };
  }

  async getMetadataList(options: MetadataSyncOptions = {}): Promise<MetadataListResult> {
    const [shelfData, notebookSummaries] = await Promise.all([
      this.getShelfData(),
      this.getNotebookSummaries(),
    ]);
    const shelfBookMap = new Map(shelfData.books.map(book => [book.bookId, book]));
    const notebookSummaryMap = new Map(notebookSummaries.map(summary => [summary.bookId, summary]));
    const archiveInfo = new Map<string, { archiveId?: number; archiveName?: string }>();
    const allBookIds = new Set<string>();

    shelfData.books.forEach(book => {
      allBookIds.add(book.bookId);
    });

    shelfData.archives.forEach(archive => {
      archive.bookIds.forEach(bookId => {
        allBookIds.add(bookId);
        archiveInfo.set(bookId, {
          archiveId: archive.archiveId,
          archiveName: archive.name,
        });
      });
    });

    notebookSummaries.forEach(summary => {
      allBookIds.add(summary.bookId);
    });

    const metadataInputs = Array.from(allBookIds).map(bookId => {
      const summary = notebookSummaryMap.get(bookId);
      const shelfBook = shelfBookMap.get(bookId);
      let metadata = summary ? parseMetadata(summary) : null;

      if (!metadata && shelfBook) {
        metadata = this.buildMetadataFromShelfBook(shelfBook);
      }
      return { bookId, baseMeta: metadata };
    });

    const { metadataList, failedBookIds } = await this.enrichMetadataInputsWithProgress(
      metadataInputs,
      bookId => archiveInfo.get(bookId),
      options
    );

    const archiveInfoRecord: Record<string, { archiveId?: number; archiveName?: string }> = {};
    archiveInfo.forEach((value, key) => {
      archiveInfoRecord[key] = value;
    });

    return {
      metadataList,
      failedBookIds,
      bookArchiveInfo: archiveInfoRecord,
    };
  }

  /**
   * 增量同步书架元数据。书架与笔记本概览总是整份拉取（1 + ⌈有笔记书数/100⌉ 个请求）；
   * 逐本补拉（/book/info + /book/getprogress）只对新书、以及最近阅读 / 最近笔记时间比上次补拉时新的书进行。
   * 其余书沿用缓存的详情，只更新书架上能直接拿到的字段（分类、笔记数、读完状态等）。
   * full = 全部重新补拉。
   */
  async syncMetadata(
    cached: Metadata[],
    options: MetadataSyncOptions & { full?: boolean } = {}
  ): Promise<IncrementalSyncResult> {
    const [shelfData, summaries] = await Promise.all([
      this.getShelfData(),
      this.getNotebookSummaries(),
    ]);
    const shelfMap = new Map(shelfData.books.map(book => [book.bookId, book]));
    const summaryMap = new Map(summaries.map(s => [s.bookId, s]));
    const cachedMap = new Map(cached.map(meta => [meta.bookId, meta]));
    const archiveInfo: Record<string, { archiveId?: number; archiveName?: string }> = {};
    shelfData.archives.forEach(archive => {
      archive.bookIds.forEach(bookId => {
        archiveInfo[bookId] = { archiveId: archive.archiveId, archiveName: archive.name };
      });
    });

    const bookIds = new Set<string>([
      ...shelfMap.keys(),
      ...summaryMap.keys(),
      ...Object.keys(archiveInfo),
    ]);
    const fingerprintOf = (bookId: string) =>
      Math.max(shelfMap.get(bookId)?.readUpdateTime ?? 0, summaryMap.get(bookId)?.sort ?? 0);

    const toEnrich: Array<{ bookId: string; baseMeta: Metadata | null }> = [];
    const unchanged: Metadata[] = [];
    for (const bookId of bookIds) {
      const shelfBook = shelfMap.get(bookId);
      const summary = summaryMap.get(bookId);
      const prev = cachedMap.get(bookId);
      const fingerprint = fingerprintOf(bookId);
      const stale =
        options.full || !prev || !prev.readInfo || (prev.synckeys?.progress ?? 0) !== fingerprint;
      if (stale) {
        const baseMeta = summary
          ? parseMetadata(summary)
          : shelfBook
            ? this.buildMetadataFromShelfBook(shelfBook)
            : null;
        toEnrich.push({ bookId, baseMeta });
        continue;
      }
      const finished = shelfBook?.markedStatus === 1 || summary?.markedStatus === 1;
      unchanged.push({
        ...prev,
        title: shelfBook?.title || summary?.book.title || prev.title,
        cover: prev.cover || shelfBook?.cover || "",
        noteCount: summary?.noteCount ?? 0,
        reviewCount: summary?.reviewCount ?? 0,
        bookmarkCount: summary?.bookmarkCount ?? 0,
        archiveId: archiveInfo[bookId]?.archiveId,
        archiveName: archiveInfo[bookId]?.archiveName,
        readInfo: {
          ...prev.readInfo!,
          readingProgress: finished ? 100 : (prev.readInfo?.readingProgress ?? 0),
        },
      });
    }

    const { metadataList, failedBookIds, degradedBookIds } =
      await this.enrichMetadataInputsWithProgress(toEnrich, bookId => archiveInfo[bookId], options);
    // 补拉失败的书：有缓存就沿用旧详情，没有就用基础元数据；都不记指纹，下次同步再试
    const retryLater = new Set([...failedBookIds, ...degradedBookIds]);
    const refreshed = metadataList.map(meta => {
      const summary = summaryMap.get(meta.bookId);
      const prev = cachedMap.get(meta.bookId);
      const base = retryLater.has(meta.bookId) && prev?.readInfo ? prev : meta;
      return {
        ...base,
        noteCount: summary?.noteCount ?? base.noteCount ?? 0,
        reviewCount: summary?.reviewCount ?? base.reviewCount ?? 0,
        archiveId: archiveInfo[meta.bookId]?.archiveId,
        archiveName: archiveInfo[meta.bookId]?.archiveName,
        synckeys: {
          ...base.synckeys,
          // 笔记指纹由拉划线那一步维护，补拉详情不能把它清掉
          highlights: prev?.synckeys?.highlights ?? base.synckeys?.highlights ?? 0,
          reviews: prev?.synckeys?.reviews ?? base.synckeys?.reviews ?? 0,
          progress: retryLater.has(meta.bookId)
            ? (prev?.synckeys?.progress ?? 0)
            : fingerprintOf(meta.bookId),
        },
      };
    });
    const present = new Set([...unchanged, ...refreshed].map(m => m.bookId));
    const keptOnFailure = failedBookIds
      .map(bookId => cachedMap.get(bookId))
      .filter((meta): meta is Metadata => Boolean(meta) && !present.has(meta!.bookId));

    return {
      metadataList: [...unchanged, ...refreshed, ...keptOnFailure],
      failedBookIds: [...retryLater],
      bookArchiveInfo: archiveInfo,
      removedBookIds: cached.map(m => m.bookId).filter(bookId => !bookIds.has(bookId)),
      presentBookIds: [...bookIds],
      requested: toEnrich.length,
      noteFingerprints: Object.fromEntries(
        summaries
          .map(s => [s.bookId, { sort: s.sort, count: s.noteCount + s.reviewCount }] as const)
          .filter(([, fingerprint]) => fingerprint.count > 0)
      ),
    };
  }

  /**
   * 只拉一本书的划线与想法（书架同步补全摘录用，KL-034）：2 个请求，章节取划线接口自带的章节，
   * 不请求详情、进度与章节接口。
   */
  async fetchNotes(bookId: string): Promise<Pick<Notebook, "chapterHighlights" | "bookReview">> {
    const [highlights, reviews] = await Promise.all([
      this.getNotebookHighlights(bookId),
      this.getNotebookReviews(bookId),
    ]);
    return {
      chapterHighlights: parseChapterHighlightReview(
        chaptersFromHighlights(highlights),
        parseHighlights(highlights, reviews),
        parseReviews(reviews)
      ),
      bookReview: parseChapterReviews(reviews),
    };
  }

  async buildNotebook(metaData: Metadata): Promise<Notebook> {
    return this.fetchNotebook(metaData);
  }

  async buildNotebookBasic(metaData: Metadata): Promise<Notebook> {
    const detail = await this.getBookDetail(metaData.bookId);
    const progress = await this.getBookProgress(metaData.bookId);
    return {
      metaData: this.mergeMetadata(metaData, detail, progress),
      chapterHighlights: [],
      bookReview: { chapterReviews: [], bookReviews: [] },
    };
  }

  async fetchNotebookDetail(notebook: Notebook): Promise<Notebook> {
    return this.fetchNotebook(notebook.metaData);
  }

  async getBookDetail(bookId: string): Promise<WeReadBookDetail | null> {
    return this.gatewayRequest<WeReadBookDetail>("/book/info", { bookId });
  }

  async getNotebookHighlights(bookId: string): Promise<HighlightResponse> {
    const response = await this.gatewayRequest<{
      updated?: HighlightResponse["updated"];
      chapters?: HighlightResponse["chapters"];
      book?: HighlightResponse["book"];
    }>("/book/bookmarklist", { bookId });
    return {
      synckey: 0,
      updated: response.updated ?? [],
      removed: [],
      chapters: response.chapters ?? [],
      book:
        response.book ??
        ({
          bookId,
          version: 0,
          format: "",
          soldout: 0,
          bookStatus: 0,
          cover: "",
          title: "",
          author: "",
        } as HighlightResponse["book"]),
    };
  }

  async getNotebookReviews(bookId: string): Promise<BookReviewResponse> {
    let synckey = 0;
    let hasMore = true;
    const reviews: BookReviewResponse["reviews"] = [];

    while (hasMore) {
      const currentSynckey = synckey;
      const response = await this.gatewayRequest<MyReviewListResponse>("/review/list/mine", {
        bookid: bookId,
        synckey,
        count: 100,
      });

      reviews.push(
        ...(response.reviews ?? []).map(item => ({
          review: {
            reviewId: item.review.reviewId,
            abstract: item.review.abstract ?? "",
            atUserVids: [],
            bookId: item.review.bookId,
            bookVersion: 0,
            chapterName: item.review.chapterName ?? "",
            chapterUid: item.review.chapterUid ?? 0,
            content: item.review.content,
            contextAbstract: item.review.abstract ?? "",
            htmlContent: item.review.content,
            range: item.review.range ?? "",
            createTime: item.review.createTime,
            title: "",
            type: item.review.type ?? 1,
            userVid: 0,
            chapterIdx: 0,
            chapterTitle: item.review.chapterTitle ?? item.review.chapterName ?? "",
            isLike: 0,
            isReposted: 0,
          },
        }))
      );

      hasMore = response.hasMore === 1;
      const nextSynckey = response.synckey ?? currentSynckey;
      if (!hasMore || nextSynckey <= currentSynckey) {
        synckey = nextSynckey;
        break;
      }
      synckey = nextSynckey;
    }

    return {
      synckey,
      totalCount: reviews.length,
      reviews,
      removed: [],
      hasMore: 0,
    };
  }

  async getChapters(bookId: string): Promise<ChapterResponse> {
    const response = await this.gatewayRequest<{
      bookId: string;
      chapters?: Chapter[];
      chapterUpdateTime?: number;
    }>("/book/chapterinfo", { bookId });

    return {
      data: [
        {
          bookId,
          chapterUpdateTime: response.chapterUpdateTime ?? 0,
          updated: response.chapters ?? [],
        },
      ],
    };
  }

  async getBookProgress(bookId: string): Promise<BookProgressResponse | null> {
    const response = await this.gatewayRequest<{
      bookId: string;
      book?: {
        chapterUid: number;
        chapterOffset: number;
        progress: number;
        updateTime: number;
        recordReadingTime?: number;
        readingTime?: number;
        startReadingTime?: number;
        finishTime?: number;
        isStartReading?: number;
      };
      progress?: number;
      chapterUid?: number;
      chapterOffset?: number;
      updateTime?: number;
      recordReadingTime?: number;
      readingTime?: number;
      startReadingTime?: number;
      finishTime?: number;
      isStartReading?: number;
      timestamp?: number;
    }>("/book/getprogress", { bookId });
    const progressBook = response.book ?? response;
    const readingTime = this.resolveReadingTime(progressBook);
    const updateTime = progressBook.updateTime ?? 0;
    const startReadingTime =
      progressBook.startReadingTime ?? (progressBook.isStartReading === 1 ? updateTime : 0);

    return {
      bookId,
      book: {
        bookVersion: 0,
        chapterUid: progressBook.chapterUid ?? 0,
        chapterOffset: progressBook.chapterOffset ?? 0,
        chapterIdx: 0,
        updateTime,
        synckey: 0,
        readingTime,
        progress: progressBook.progress ?? 0,
        startReadingTime,
        finishTime: progressBook.finishTime ?? 0,
      },
      timestamp: response.timestamp ?? 0,
    };
  }

  async buildMetadataFromBookId(bookId: string): Promise<Metadata | null> {
    try {
      const [detail, progress] = await Promise.all([
        this.getBookDetail(bookId),
        this.getBookProgress(bookId),
      ]);
      if (!detail) {
        return null;
      }
      return this.mergeMetadata(
        {
          bookId,
          author: detail.author ?? "",
          title: detail.title ?? "",
          url: undefined,
          webUrl: getBookWebUrl(bookId, detail.title),
          cover: detail.cover ?? "",
          bookType: detail.type ?? 0,
          publishTime: detail.publishTime ?? "",
          noteCount: 0,
          reviewCount: 0,
          bookmarkCount: 0,
          lastReadDate: "",
        },
        detail,
        progress
      );
    } catch (error) {
      if (error instanceof WeReadRateLimitError) {
        throw error;
      }
      return null;
    }
  }

  private async enrichMetadata(metaData: Metadata): Promise<Metadata> {
    const [detail, progress] = await Promise.all([
      this.getBookDetail(metaData.bookId),
      this.getBookProgress(metaData.bookId),
    ]);
    return this.mergeMetadata(metaData, detail, progress);
  }

  private async enrichMetadataInputsWithProgress(
    inputs: Array<{ bookId: string; baseMeta: Metadata | null }>,
    getArchive: (bookId: string) => { archiveId?: number; archiveName?: string } | undefined,
    options: MetadataSyncOptions
  ): Promise<{
    metadataList: Metadata[];
    failedBookIds: string[];
    /** 补拉失败、以基础元数据兜底的书 */
    degradedBookIds: string[];
  }> {
    const total = inputs.length;
    let completed = 0;
    const metadataList: Metadata[] = [];
    const failedBookIds: string[] = [];
    const degradedBookIds: string[] = [];
    const concurrency = METADATA_SYNC_CONCURRENCY;

    const reportProgress = () => {
      options.onProgress?.({ completed, total });
    };
    reportProgress();

    const enrichOne = async (input: {
      bookId: string;
      baseMeta: Metadata | null;
    }): Promise<Metadata | null> => {
      let lastError: unknown = null;
      for (let attempt = 0; attempt < METADATA_SYNC_MAX_ATTEMPTS; attempt += 1) {
        try {
          const metadata = input.baseMeta
            ? await this.enrichMetadata(input.baseMeta)
            : await this.buildMetadataFromBookId(input.bookId);
          if (metadata) {
            return metadata;
          }
        } catch (error) {
          lastError = error;
          if (error instanceof WeReadRateLimitError) {
            if (attempt < METADATA_SYNC_MAX_ATTEMPTS - 1) {
              await this.delay(this.getRetryDelayMs(attempt));
              continue;
            }
            break;
          }
          if (error instanceof WeReadSessionExpiredError) {
            throw error;
          }
        }
      }

      if (lastError) {
        console.warn("[WeRead] metadata enrich failed", {
          bookId: input.bookId,
          error: lastError,
        });
      }
      degradedBookIds.push(input.bookId);
      return input.baseMeta;
    };

    for (let index = 0; index < inputs.length; index += concurrency) {
      const batch = inputs.slice(index, index + concurrency);
      const results = await Promise.allSettled(batch.map(enrichOne));

      results.forEach((result, resultIndex) => {
        const bookId = batch[resultIndex].bookId;
        if (result.status === "fulfilled" && result.value) {
          const archive = getArchive(bookId);
          if (archive) {
            result.value.archiveId = archive.archiveId;
            result.value.archiveName = archive.archiveName;
          }
          metadataList.push(result.value);
        } else {
          failedBookIds.push(bookId);
        }
        completed += 1;
        reportProgress();
      });

      if (index + concurrency < inputs.length) {
        await this.delay(METADATA_SYNC_BATCH_DELAY_MS);
      }
    }

    return { metadataList, failedBookIds, degradedBookIds };
  }

  private getRetryDelayMs(attempt: number): number {
    return METADATA_SYNC_RETRY_BASE_DELAY_MS * 2 ** attempt;
  }

  private resolveReadingTime(progressBook: {
    recordReadingTime?: number;
    readingTime?: number;
  }): number {
    const recordReadingTime = progressBook.recordReadingTime ?? 0;
    if (recordReadingTime > 0) {
      return recordReadingTime;
    }
    return progressBook.readingTime ?? 0;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getShelfData(): Promise<ShelfData> {
    const response = await this.gatewayRequest<ShelfSyncResponse>("/shelf/sync");
    const books = [
      ...(response.books ?? []).map(book => ({
        bookId: book.bookId,
        title: book.title,
        author: book.author,
        cover: book.cover,
        type: 1,
        category: book.category,
        publishTime: book.publishTime,
        readingProgress: book.finishReading === 1 ? 100 : undefined,
        markedStatus: book.finishReading === 1 ? 1 : 0,
        lastReadDate: formatUnixDate(book.readUpdateTime),
        readUpdateTime: book.readUpdateTime ?? 0,
        intro: book.intro,
        publisher: book.publisher,
        totalWords: book.totalWords,
      })),
      ...(response.albums ?? []).map(album => ({
        bookId: album.albumInfo.albumId,
        title: album.albumInfo.name,
        author: album.albumInfo.authorName,
        cover: album.albumInfo.cover,
        type: 2,
        readingProgress: album.albumInfo.finish === 1 ? 100 : undefined,
        markedStatus: album.albumInfo.finish === 1 ? 1 : 0,
        lastReadDate: formatUnixDate(
          album.albumInfoExtra?.lectureReadUpdateTime ?? album.albumInfo.updateTime
        ),
        readUpdateTime:
          album.albumInfoExtra?.lectureReadUpdateTime ?? album.albumInfo.updateTime ?? 0,
        intro: album.albumInfo.intro,
      })),
    ];
    const archives = (response.archive ?? []).map(archive => ({
      archiveId: archive.archiveId,
      name: archive.name,
      bookIds: [...(archive.bookIds ?? []), ...(archive.albumIds ?? [])],
    }));
    const bookArchiveMap = new Map<string, string>();
    archives.forEach(archive => {
      archive.bookIds.forEach(bookId => {
        bookArchiveMap.set(bookId, archive.name);
      });
    });
    return {
      books,
      archives,
      bookArchiveMap,
    };
  }

  resolveBookWebLink(book: Pick<Metadata, "bookId" | "title" | "webUrl">): string | null {
    return book.webUrl ?? getBookWebUrl(book.bookId, book.title);
  }

  private async fetchNotebook(metaData: Metadata): Promise<Notebook> {
    const [detail, progress, highlights, reviews, chapters] = await Promise.all([
      this.getBookDetail(metaData.bookId),
      this.getBookProgress(metaData.bookId),
      this.getNotebookHighlights(metaData.bookId),
      this.getNotebookReviews(metaData.bookId),
      this.getChapters(metaData.bookId),
    ]);

    const mergedMeta = this.mergeMetadata(metaData, detail, progress);
    const highlightList = parseHighlights(highlights, reviews);
    const reviewList = parseReviews(reviews);
    const chapterList = parseChapterResp(chapters, highlights);
    const chapterHighlights = parseChapterHighlightReview(chapterList, highlightList, reviewList);

    return {
      metaData: mergedMeta,
      chapterHighlights,
      bookReview: parseChapterReviews(reviews),
    };
  }

  private mergeMetadata(
    metaData: Metadata,
    detail: WeReadBookDetail | null,
    progress: BookProgressResponse | null
  ): Metadata {
    const readingProgress = progress?.book?.progress ?? 0;
    const lastReadDate =
      progress?.book?.updateTime && progress.book.updateTime > 0
        ? dayjs(progress.book.updateTime * 1000).format("YYYY-MM-DD")
        : metaData.lastReadDate;

    return {
      ...metaData,
      author: detail?.author ?? metaData.author,
      title: detail?.title ?? metaData.title,
      cover: detail?.cover ?? metaData.cover,
      bookType: detail?.type ?? metaData.bookType,
      publishTime: detail?.publishTime ?? metaData.publishTime,
      intro: detail?.intro ?? metaData.intro,
      isbn: detail?.isbn ?? metaData.isbn,
      category: detail?.category ?? metaData.category,
      publisher: detail?.publisher ?? metaData.publisher,
      totalWords: detail?.totalWords ?? detail?.wordCount ?? metaData.totalWords,
      rating:
        detail?.newRating && detail.newRating > 0
          ? (detail.newRating / 100).toFixed(1)
          : metaData.rating,
      webUrl: metaData.webUrl ?? getBookWebUrl(metaData.bookId, detail?.title ?? metaData.title),
      lastReadDate,
      synckeys: {
        highlights: metaData.synckeys?.highlights ?? 0,
        reviews: metaData.synckeys?.reviews ?? 0,
        progress: metaData.synckeys?.progress ?? 0,
      },
      readInfo: {
        markedStatus: readingProgress >= 100 ? 1 : metaData.readInfo?.markedStatus,
        readingTime: progress?.book?.readingTime ?? metaData.readInfo?.readingTime ?? 0,
        readingBookDate:
          progress?.book?.startReadingTime ?? metaData.readInfo?.readingBookDate ?? 0,
        finishedDate: progress?.book?.finishTime ?? metaData.readInfo?.finishedDate ?? 0,
        readingProgress,
        totalReadDay: metaData.readInfo?.totalReadDay,
        continueReadDays: metaData.readInfo?.continueReadDays,
      },
    };
  }

  private buildMetadataFromShelfBook(book: ShelfData["books"][number]): Metadata {
    return {
      bookId: book.bookId,
      author: book.author ?? "",
      title: book.title ?? "",
      url: undefined,
      webUrl: getBookWebUrl(book.bookId, book.title),
      cover: book.cover ?? "",
      bookType: book.type ?? 0,
      publishTime: book.publishTime ?? "",
      noteCount: 0,
      reviewCount: 0,
      bookmarkCount: 0,
      lastReadDate: book.lastReadDate ?? "",
      intro: book.intro,
      category: book.category,
      publisher: book.publisher,
      totalWords: book.totalWords,
      rating: book.rating,
      readInfo: {
        markedStatus: book.markedStatus,
        readingTime: book.readingTime ?? 0,
        readingBookDate: 0,
        finishedDate: 0,
        readingProgress: book.readingProgress ?? 0,
      },
    };
  }

  private getApiKey(): string {
    return this.options.getApiKey().trim();
  }

  private async gatewayRequest<T>(
    apiName: string,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new WeReadNotLoggedInError();
    }
    if (/[\r\n]/.test(apiKey)) throw new Error("API Key 格式无效，请检查账号与连接配置");

    const response = await this.options.fetch(WEREAD_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_name: apiName,
        skill_version: SKILL_VERSION,
        ...params,
      }),
    });

    if (!response.ok) await response.body?.cancel();
    if (response.status === 401 || response.status === 403) {
      throw new WeReadSessionExpiredError();
    }
    if (response.status === 429 || response.status === 499) {
      throw new WeReadRateLimitError(`WeRead 请求过快: ${response.status}`);
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`WeRead 请求失败: ${response.status}`);
    }

    const data = (await response.json()) as GatewayEnvelope<T>;

    // 网关附带 upgrade_info 时业务数据仍正常返回，仅降级为警告，
    // 避免官方每发布一个 Skill 新版本就中断本地同步
    if (data.upgrade_info?.message) {
      console.warn(
        `[WeRead] Skill 版本待升级: 当前 ${data.upgrade_info.current_version ?? SKILL_VERSION}，最新 ${data.upgrade_info.latest_version ?? "未知"}（${data.upgrade_info.message}）`
      );
    }
    if (data.errcode === -10102) {
      throw new WeReadRateLimitError(data.errmsg || "API 调用频率超限");
    }
    if (data.errcode === -2011 || data.errcode === -2012) {
      throw new WeReadSessionExpiredError(
        data.errmsg || "连接状态已失效，请重新检查微信读书 API Key"
      );
    }
    if (data.errcode && data.errcode !== 0) {
      throw new Error(data.errmsg || `微信读书请求失败: ${data.errcode}`);
    }

    return data;
  }
}

const formatUnixDate = (timestamp?: number): string => {
  if (!timestamp || timestamp <= 0) {
    return "";
  }
  return dayjs(timestamp * 1000).format("YYYY-MM-DD");
};
