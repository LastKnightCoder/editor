import {
  parseHighlights,
  parseChapterResp,
  parseArticleHighlightReview,
  parseChapterHighlightReview,
  parseReviews,
  parseChapterReviews,
  getPcUrl,
} from "./parser";
import {
  parseCookieString,
  hasValidWeReadSession,
  extractWeReadUserInfo,
} from "./cookies";
import {
  WeReadRateLimitError,
  WeReadSessionExpiredError,
  WeReadNotLoggedInError,
} from "./errors";
import useSettingStore from "@/stores/useSettingStore";
import type {
  Metadata,
  Notebook,
  WeReadCookie,
  WeReadHttpRequestPayload,
  WeReadNotebookSummary,
  BookDetailResponse,
  BookProgressResponse,
  HighlightResponse,
  BookReviewResponse,
  ChapterResponse,
  ShelfData,
} from "@/types/weread";
import { weReadHttpRequest, weReadLoginWithQRCode } from "@/commands/weread";
import shelfParserService from "./shelf-parser";

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

// 重新导出错误类，保持向后兼容
export { WeReadRateLimitError } from "./errors";

class WeReadService {
  private pendingSessionValidation: {
    key: string;
    promise: Promise<boolean>;
  } | null = null;

  async loginWithQRCode(): Promise<void> {
    const result = await weReadLoginWithQRCode();
    this.updateCookies(result.cookies);
    this.setSessionState("checking");
    useSettingStore.getState().setWeReadLoginMethod("qr");
    useSettingStore.getState().setWeReadEnabled(true);
    const isValid = await this.validateSession();
    if (!isValid) {
      this.throwSessionValidationError();
    }
  }

  async fetchMetadataByBookIds(
    bookIds: string[],
    archiveInfo: Record<
      string,
      { archiveId?: number; archiveName?: string }
    > = {},
  ): Promise<MetadataListResult> {
    const archiveMap = new Map<
      string,
      { archiveId?: number; archiveName?: string }
    >(Object.entries(archiveInfo));
    return this.fetchMetadataForIds(bookIds, archiveMap);
  }

  async loginWithCookieString(cookieString: string): Promise<void> {
    const cookies = parseCookieString(cookieString);
    if (!hasValidWeReadSession(cookies)) {
      throw new Error("无效的 Cookie，请确认已登录微信读书");
    }
    this.updateCookies(cookies);
    this.setSessionState("checking");
    useSettingStore.getState().setWeReadLoginMethod("manual");
    useSettingStore.getState().setWeReadEnabled(true);
    const isValid = await this.validateSession();
    if (!isValid) {
      this.throwSessionValidationError();
    }
  }

  logout(): void {
    useSettingStore.getState().clearWeReadCookies();
  }

  getCookies(): WeReadCookie[] {
    return useSettingStore.getState().setting.integration.weread.cookies;
  }

  async refreshCookie(): Promise<boolean> {
    const cookies = this.getCookies();
    if (cookies.length === 0) {
      return false;
    }
    try {
      const response = await weReadHttpRequest({
        path: "/",
        method: "HEAD",
        cookies,
        responseType: "none",
      });
      this.maybeUpdateCookies(response.cookies);
      return true;
    } catch (error) {
      console.warn("刷新微信读书 Cookie 失败", error);
      return false;
    }
  }

  /**
   * 验证当前 cookie 是否有效
   * 通过调用实际 API 来检查登录状态，比 HEAD 请求更可靠
   */
  async validateSession(): Promise<boolean> {
    const cookies = this.getCookies();
    if (cookies.length === 0) {
      this.setSessionState("unknown");
      return false;
    }

    const validationKey = this.buildCookieSnapshotKey(cookies);
    if (this.pendingSessionValidation?.key === validationKey) {
      return this.pendingSessionValidation.promise;
    }

    this.setSessionState("checking");
    const validationPromise = this.runSessionValidation(
      cookies,
      validationKey,
    ).finally(() => {
      if (
        this.pendingSessionValidation?.key === validationKey &&
        this.pendingSessionValidation.promise === validationPromise
      ) {
        this.pendingSessionValidation = null;
      }
    });
    this.pendingSessionValidation = {
      key: validationKey,
      promise: validationPromise,
    };

    return validationPromise;
  }

  async getNotebookSummaries(): Promise<WeReadNotebookSummary[]> {
    let allBooks: WeReadNotebookSummary[] = [];
    let synckey = 0;
    let hasMore = true;

    // 循环获取所有书籍，直到没有更多数据
    while (hasMore) {
      const response = await this.request<{
        errcode?: number;
        books: WeReadNotebookSummary[];
        synckey?: number;
        hasMore?: number;
      }>({
        path: `/api/user/notebook?count=999&synckey=${synckey}`,
      });

      const books = response.books ?? [];
      allBooks = allBooks.concat(books);

      // 检查是否还有更多数据
      if (response.synckey && response.synckey > synckey) {
        synckey = response.synckey;
      } else {
        hasMore = false;
      }

      // 如果返回的书籍数量少于请求数量，说明已经到底了
      if (books.length < 999) {
        hasMore = false;
      }

      console.log(`已获取 ${allBooks.length} 本书籍，synckey: ${synckey}`);
    }

    console.log(`总共获取 ${allBooks.length} 本书籍`);
    return allBooks;
  }

  async getMetadataList(): Promise<MetadataListResult> {
    const shelfData = await this.getShelfData();
    const archiveInfo = new Map<
      string,
      { archiveId: number; archiveName: string }
    >();
    const allBookIds: string[] = [];

    shelfData.archives.forEach((archive) => {
      archive.bookIds.forEach((bookId) => {
        if (!archiveInfo.has(bookId)) {
          allBookIds.push(bookId);
        }
        archiveInfo.set(bookId, {
          archiveId: archive.archiveId,
          archiveName: archive.name,
        });
      });
    });

    return this.fetchMetadataForIds(allBookIds, archiveInfo);
  }

  async buildNotebook(metaData: Metadata): Promise<Notebook> {
    const [detail, progress, highlights, reviews, chapters] = await Promise.all(
      [
        this.getBookDetail(metaData.bookId),
        this.getBookProgress(metaData.bookId),
        this.getNotebookHighlights(metaData.bookId),
        this.getNotebookReviews(metaData.bookId),
        this.getChapters(metaData.bookId),
      ],
    );

    // 打印 API 响应数据结构
    console.log("=== WeRead API Response ===");
    console.log("Book ID:", metaData.bookId);
    console.log("Book Detail:", detail);
    console.log("Book Progress:", progress);
    console.log("Highlights:", highlights);
    console.log("Reviews:", reviews);
    console.log("Chapters:", chapters);
    console.log("==========================");

    const mutableMeta: Metadata = { ...metaData };
    if (detail) {
      const readerUrl = detail.encodeId
        ? `https://weread.qq.com/web/reader/${detail.encodeId}`
        : getPcUrl(metaData.bookId);
      mutableMeta.encodeId = detail.encodeId;
      mutableMeta.category = detail.category;
      mutableMeta.publisher = detail.publisher;
      mutableMeta.isbn = detail.isbn;
      mutableMeta.intro = detail.intro;
      mutableMeta.totalWords = detail.totalWords;
      mutableMeta.pcUrl = readerUrl;
      mutableMeta.url = readerUrl;
      // newRating 是整数，例如 849 表示 8.49 分，需要除以 100
      mutableMeta.rating =
        detail.newRating > 0
          ? `${(detail.newRating / 100).toFixed(1)}`
          : undefined;
    }

    if (progress?.book) {
      mutableMeta.readInfo = {
        readingProgress: progress.book.progress,
        readingTime: progress.book.readingTime,
        readingBookDate: progress.book.startReadingTime,
        finishedDate: progress.book.finishTime,
      };
    }

    // 收集 synckey 用于增量同步
    mutableMeta.synckeys = {
      highlights: highlights?.synckey,
      reviews: reviews?.synckey,
      progress: progress?.book?.synckey,
    };

    const highlightList = parseHighlights(highlights, reviews);
    const reviewList = parseReviews(reviews);
    const chapterList = parseChapterResp(chapters, highlights);

    const chapterHighlights =
      mutableMeta.bookType === 3
        ? parseArticleHighlightReview(chapterList, highlightList, reviewList)
        : parseChapterHighlightReview(chapterList, highlightList, reviewList);

    const bookReview = parseChapterReviews(reviews);

    return {
      metaData: mutableMeta,
      chapterHighlights,
      bookReview,
    };
  }

  async buildNotebookBasic(metaData: Metadata): Promise<Notebook> {
    const [detail, progress] = await Promise.all([
      this.getBookDetail(metaData.bookId),
      this.getBookProgress(metaData.bookId),
    ]);

    const mutableMeta: Metadata = { ...metaData };
    if (detail) {
      const readerUrl = detail.encodeId
        ? `https://weread.qq.com/web/reader/${detail.encodeId}`
        : getPcUrl(metaData.bookId);
      mutableMeta.encodeId = detail.encodeId;
      mutableMeta.category = detail.category;
      mutableMeta.publisher = detail.publisher;
      mutableMeta.isbn = detail.isbn;
      mutableMeta.intro = detail.intro;
      mutableMeta.totalWords = detail.totalWords;
      mutableMeta.pcUrl = readerUrl;
      mutableMeta.url = readerUrl;
      mutableMeta.rating =
        detail.newRating > 0
          ? `${(detail.newRating / 100).toFixed(1)}`
          : undefined;
    }

    if (progress?.book) {
      mutableMeta.readInfo = {
        readingProgress: progress.book.progress,
        readingTime: progress.book.readingTime,
        readingBookDate: progress.book.startReadingTime,
        finishedDate: progress.book.finishTime,
      };
    }

    mutableMeta.synckeys = {
      progress: progress?.book?.synckey,
    };

    return {
      metaData: mutableMeta,
      chapterHighlights: [],
      bookReview: { chapterReviews: [], bookReviews: [] },
    };
  }

  /**
   * 获取书籍的高亮和评论详情，并更新 notebook
   * 用于用户打开详情时延迟加载
   */
  async fetchNotebookDetail(notebook: Notebook): Promise<Notebook> {
    const { metaData } = notebook;
    const [highlights, reviews, chapters] = await Promise.all([
      this.getNotebookHighlights(metaData.bookId),
      this.getNotebookReviews(metaData.bookId),
      this.getChapters(metaData.bookId),
    ]);

    // 更新 synckeys
    const mutableMeta: Metadata = {
      ...metaData,
      synckeys: {
        ...metaData.synckeys,
        highlights: highlights?.synckey,
        reviews: reviews?.synckey,
      },
    };

    const highlightList = parseHighlights(highlights, reviews);
    const reviewList = parseReviews(reviews);
    const chapterList = parseChapterResp(chapters, highlights);

    const chapterHighlights =
      mutableMeta.bookType === 3
        ? parseArticleHighlightReview(chapterList, highlightList, reviewList)
        : parseChapterHighlightReview(chapterList, highlightList, reviewList);

    const bookReview = parseChapterReviews(reviews);

    return {
      metaData: mutableMeta,
      chapterHighlights,
      bookReview,
    };
  }

  async getBookDetail(bookId: string): Promise<BookDetailResponse | null> {
    const response = await this.request<
      BookDetailResponse & {
        errCode?: number;
      }
    >({
      path: `/web/book/info?bookId=${bookId}`,
    });
    return response;
  }

  async getNotebookHighlights(bookId: string): Promise<HighlightResponse> {
    // 添加时间戳避免缓存
    const timestamp = Date.now();
    return this.request<HighlightResponse>({
      path: `/web/book/bookmarklist?bookId=${bookId}&_t=${timestamp}`,
    });
  }

  async getNotebookReviews(bookId: string): Promise<BookReviewResponse> {
    // 添加时间戳避免缓存
    const timestamp = Date.now();
    const url = `/web/review/list?bookId=${bookId}&listType=11&mine=1&synckey=0&_t=${timestamp}`;
    return this.request<BookReviewResponse>({
      path: url,
    });
  }

  async getChapters(bookId: string): Promise<ChapterResponse> {
    return this.request<ChapterResponse>({
      path: "/web/book/chapterInfos",
      method: "POST",
      body: { bookIds: [bookId] },
    });
  }

  async getBookProgress(bookId: string): Promise<BookProgressResponse | null> {
    return this.request<BookProgressResponse>({
      path: `/web/book/getProgress?bookId=${bookId}`,
    });
  }

  private async request<T>(payload: WeReadHttpRequestPayload): Promise<T> {
    const cookies = this.getCookies();
    if (cookies.length === 0) {
      throw new WeReadNotLoggedInError();
    }

    const mergedPayload: WeReadHttpRequestPayload = {
      ...payload,
      cookies,
    };

    const response = await weReadHttpRequest<T>(mergedPayload);
    this.maybeUpdateCookies(response.cookies);

    // 检测登录失效（401, 403）
    if (response.status === 401 || response.status === 403) {
      console.warn("[WeRead] 登录状态已失效，需要重新登录");
      throw this.handleSessionInvalid();
    }

    if (!response.ok) {
      throw new Error(`WeRead 请求失败: ${response.status}`);
    }

    // 检测 API 错误码
    const data = response.data as Record<string, unknown>;
    if (data && typeof data === "object") {
      const errcode = data.errcode as number | undefined;
      const errmsg = data.errmsg as string | undefined;

      // 检测登录过期错误码
      if (errcode === -2012 || errcode === -2011) {
        console.warn("[WeRead] 登录状态已过期（errcode: %s）", errcode);
        throw this.handleSessionInvalid(errmsg);
      }

      // 检测 API 限流错误
      if (errcode === -10102) {
        throw new WeReadRateLimitError(errmsg || "API 调用频率超限");
      }
    }

    return response.data as T;
  }

  private async runSessionValidation(
    cookies: WeReadCookie[],
    validationKey: string,
  ): Promise<boolean> {
    try {
      const response = await weReadHttpRequest<{
        errcode?: number;
        errmsg?: string;
      }>({
        path: "/web/user",
        method: "GET",
        cookies,
        responseType: "json",
      });

      if (response.status === 401 || response.status === 403) {
        console.warn("[WeRead] Session 已失效，需要重新登录");
        if (!this.isCookieSnapshotCurrent(validationKey)) {
          return false;
        }
        this.handleSessionInvalid();
        return false;
      }

      if (!response.ok) {
        console.warn("[WeRead] Session 验证请求失败:", response.status);
        if (!this.isCookieSnapshotCurrent(validationKey)) {
          return false;
        }
        this.setSessionState(
          "unknown",
          `验证登录状态失败（HTTP ${response.status}）`,
        );
        return false;
      }

      const data = response.data;
      if (data && typeof data === "object") {
        const errcode = data.errcode;
        const errmsg = data.errmsg;
        if (errcode === -2012 || errcode === -2011) {
          console.warn("[WeRead] Session 已过期（errcode: %s）", errcode);
          if (!this.isCookieSnapshotCurrent(validationKey)) {
            return false;
          }
          this.handleSessionInvalid(errmsg);
          return false;
        }
        if (errcode && errcode !== 0) {
          console.warn("[WeRead] Session 验证返回错误码:", errcode);
          if (!this.isCookieSnapshotCurrent(validationKey)) {
            return false;
          }
          this.setSessionState(
            "unknown",
            errmsg || "验证登录状态失败，请稍后重试",
          );
          return false;
        }
      }

      if (!this.isCookieSnapshotCurrent(validationKey)) {
        return false;
      }
      this.applyValidatedSession(response.cookies, cookies);
      return true;
    } catch (error) {
      console.error("[WeRead] 验证 session 失败", error);
      if (!this.isCookieSnapshotCurrent(validationKey)) {
        return false;
      }
      this.setSessionState("unknown", "验证登录状态失败，请检查网络后重试");
      return false;
    }
  }

  private handleSessionInvalid(message?: string): WeReadSessionExpiredError {
    const nextMessage = message || "登录状态已过期，请重新登录微信读书";
    useSettingStore.getState().invalidateWeReadSession(nextMessage);
    return new WeReadSessionExpiredError(nextMessage);
  }

  private throwSessionValidationError(): never {
    const { sessionStatus, statusReason } =
      useSettingStore.getState().setting.integration.weread;
    if (sessionStatus === "invalid") {
      throw new WeReadSessionExpiredError(statusReason);
    }
    throw new Error(statusReason || "验证登录状态失败，请稍后重试");
  }

  private applyValidatedSession(
    nextCookies: WeReadCookie[],
    fallbackCookies: WeReadCookie[],
  ) {
    const cookiesToUse = nextCookies.length > 0 ? nextCookies : fallbackCookies;
    this.maybeUpdateCookies(cookiesToUse);
    const userInfo = extractWeReadUserInfo(cookiesToUse);
    useSettingStore.getState().updateWeReadUserInfo({
      ...userInfo,
      isConnected: true,
    });
    this.setSessionState("valid");
  }

  private setSessionState(
    status: "checking" | "valid" | "unknown",
    reason = "",
  ) {
    const validatedAt = status === "checking" ? 0 : Date.now();
    useSettingStore.getState().setWeReadSessionState({
      sessionStatus: status,
      lastValidatedAt: validatedAt,
      statusReason: reason,
    });
  }

  private maybeUpdateCookies(nextCookies: WeReadCookie[]) {
    const current = this.getCookies();
    if (nextCookies.length === 0) {
      return; // 不用空 Cookie 覆盖已有的
    }

    // 使用 Map 比较，避免依赖数组顺序
    const currentMap = new Map(current.map((c) => [c.name, c.value]));
    const nextMap = new Map(nextCookies.map((c) => [c.name, c.value]));

    // 检查关键 Cookie 是否变化
    const keyFields = ["wr_skey", "wr_rt", "wr_vid", "wr_name"];
    const hasChange = keyFields.some(
      (key) => currentMap.get(key) !== nextMap.get(key),
    );

    if (hasChange) {
      this.updateCookies(nextCookies);
    }
  }

  private updateCookies(cookies: WeReadCookie[]) {
    useSettingStore.getState().updateWeReadCookies(cookies);
  }

  private isCookieSnapshotCurrent(snapshotKey: string): boolean {
    return snapshotKey === this.buildCookieSnapshotKey(this.getCookies());
  }

  private buildCookieSnapshotKey(cookies: WeReadCookie[]): string {
    return cookies
      .map(({ name, value }) => `${name}=${value}`)
      .sort()
      .join("; ");
  }

  async addReview(payload: {
    type: number;
    bookId: string;
    chapterUid: number;
    content: string;
    bookVersion: number;
    isPrivate: number;
    abstract: string;
    range: string;
  }): Promise<{ reviewId: string }> {
    return this.request<{ reviewId: string }>({
      path: "/web/review/add",
      method: "POST",
      body: payload,
    });
  }

  async deleteReview(reviewId: string): Promise<void> {
    return this.request<void>({
      path: "/web/review/delete",
      method: "POST",
      body: { reviewId },
    });
  }

  async updateReview(
    reviewId: string,
    payload: {
      type: number;
      bookId: string;
      chapterUid: number;
      content: string;
      bookVersion: number;
      isPrivate: number;
      abstract: string;
      range: string;
    },
  ): Promise<{ reviewId: string }> {
    await this.deleteReview(reviewId);
    return this.addReview(payload);
  }

  async deleteBookmark(bookmarkId: string): Promise<void> {
    return this.request<void>({
      path: "/web/book/removeBookmark",
      method: "POST",
      body: { bookmarkId },
    });
  }

  async updateBookmark(
    bookmarkId: string,
    style: number,
    colorStyle: number,
  ): Promise<void> {
    console.log("[WeRead] 更新高亮样式:", { bookmarkId, style, colorStyle });
    const result = await this.request<{ succ?: number; errcode?: number }>({
      path: "/web/book/updateBookmark",
      method: "POST",
      body: { bookmarkId, style, colorStyle },
    });
    console.log("[WeRead] 更新高亮样式结果:", result);
    // 检查返回结果
    if (result && typeof result === "object" && result.errcode) {
      throw new Error(`更新高亮失败: ${result.errcode}`);
    }
  }

  /**
   * 获取书架数据（包含所有书籍和分类信息）
   * 通过解析书架页面的 SSR HTML 获取
   */
  /**
   * 为没有 metadata 的书籍构建基础元数据
   * 通过调用 getBookDetail 和 getBookProgress 获取信息
   */
  async buildMetadataFromBookId(
    bookId: string,
    shelfBook?: {
      title: string;
      author: string;
      cover: string;
    },
  ): Promise<Metadata | null> {
    try {
      const [detail, progress] = await Promise.all([
        this.getBookDetail(bookId),
        this.getBookProgress(bookId),
      ]);

      if (!detail) {
        console.warn(`书籍 ${bookId} 详情获取失败`);
        return null;
      }

      const readerUrl = detail.encodeId
        ? `https://weread.qq.com/web/reader/${detail.encodeId}`
        : getPcUrl(bookId);
      const metadata: Metadata = {
        bookId: bookId,
        encodeId: detail.encodeId,
        author: shelfBook?.author || detail.author || "",
        title: shelfBook?.title || detail.title || "",
        url: readerUrl,
        pcUrl: readerUrl,
        cover: shelfBook?.cover || detail.cover || "",
        bookType: detail.type || 0,
        publishTime: detail.publishTime || "",
        noteCount: 0, // 没有笔记
        reviewCount: 0, // 没有评论
        lastReadDate: "",
        category: detail.category,
        publisher: detail.publisher,
        isbn: detail.isbn,
        intro: detail.intro,
        totalWords: detail.totalWords,
        rating:
          detail.newRating > 0
            ? `${(detail.newRating / 100).toFixed(1)}`
            : undefined,
        synckeys: {
          progress: progress?.book?.synckey,
        },
        readInfo: progress?.book
          ? {
              readingProgress: progress.book.progress,
              readingTime: progress.book.readingTime,
              readingBookDate: progress.book.startReadingTime,
              finishedDate: progress.book.finishTime,
            }
          : undefined,
      };

      return metadata;
    } catch (error) {
      if (error instanceof WeReadRateLimitError) {
        throw error;
      }
      console.error(`构建书籍 ${bookId} 元数据失败`, error);
      return null;
    }
  }

  private async fetchMetadataForIds(
    bookIds: string[],
    archiveInfo?: Map<string, { archiveId?: number; archiveName?: string }>,
  ): Promise<MetadataListResult> {
    const metadataList: Metadata[] = [];
    const failedBookIds: string[] = [];
    const batchSize = 100;
    const concurrency = 5; // 并发数

    for (let i = 0; i < bookIds.length; i += batchSize) {
      const chunk = bookIds.slice(i, i + batchSize);

      // 使用并发控制处理每个批次
      const results = await this.processWithConcurrency(
        chunk,
        concurrency,
        async (bookId) => {
          try {
            const meta = await this.fetchMetadataWithRetry(bookId);
            return { bookId, meta, error: null };
          } catch (error) {
            return { bookId, meta: null, error };
          }
        },
      );

      // 处理结果
      for (const result of results) {
        if (result.meta) {
          const info = archiveInfo?.get(result.bookId);
          if (info) {
            result.meta.archiveName = info.archiveName;
            result.meta.archiveId = info.archiveId;
          }
          metadataList.push(result.meta);
        } else {
          failedBookIds.push(result.bookId);
        }
      }

      // 批次间延迟
      if (i + batchSize < bookIds.length) {
        await this.delay(2000);
      }
    }

    const archiveInfoRecord: Record<
      string,
      { archiveId?: number; archiveName?: string }
    > = {};
    if (archiveInfo) {
      archiveInfo.forEach((value, key) => {
        archiveInfoRecord[key] = value;
      });
    }

    return { metadataList, failedBookIds, bookArchiveInfo: archiveInfoRecord };
  }

  /**
   * 并发控制处理函数
   * @param items 待处理的项目
   * @param concurrency 并发数
   * @param processor 处理函数
   */
  private async processWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    processor: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = [];
    const executing: Promise<void>[] = [];

    for (const item of items) {
      const promise = processor(item).then((result) => {
        results.push(result);
      });

      const executingPromise = promise.then(() => {
        executing.splice(executing.indexOf(executingPromise), 1);
      });
      executing.push(executingPromise);

      // 当达到并发上限时，等待最快完成的
      if (executing.length >= concurrency) {
        await Promise.race(executing);
      }
    }

    // 等待所有剩余的请求完成
    await Promise.all(executing);
    return results;
  }

  private async fetchMetadataWithRetry(
    bookId: string,
    retries = 3,
  ): Promise<Metadata | null> {
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        const meta = await this.buildMetadataFromBookId(bookId);
        if (meta) {
          return meta;
        }
        console.warn(
          `[WeRead] 未获取到 ${bookId} 元数据 (第 ${attempt}/${retries} 次`,
        );
      } catch (error) {
        if (error instanceof WeReadRateLimitError && attempt < retries) {
          const delayMs = 3000 * attempt;
          console.warn(
            `[WeRead] 元数据接口限流，${delayMs}ms 后重试 ${bookId}`,
          );
          await this.delay(delayMs);
          continue;
        }
        throw error;
      }
    }
    return null;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getShelfData(): Promise<ShelfData> {
    const cookies = this.getCookies();
    if (cookies.length === 0) {
      throw new Error("请先登录微信读书");
    }

    const response = await weReadHttpRequest({
      path: "/web/shelf",
      method: "GET",
      cookies,
      responseType: "text",
    });

    this.maybeUpdateCookies(response.cookies);

    if (!response.ok || !response.data) {
      throw new Error(`获取书架数据失败: ${response.status}`);
    }

    // 解析 HTML 提取书架数据
    const shelfData = shelfParserService.parseShelfHTML(
      response.data as string,
    );
    return shelfData;
  }
}

const weReadService = new WeReadService();
export default weReadService;
