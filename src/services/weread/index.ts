import {
  parseMetadata,
  parseHighlights,
  parseChapterResp,
  parseArticleHighlightReview,
  parseChapterHighlightReview,
  parseReviews,
  parseChapterReviews,
  type WeReadParserOptions,
} from "./parser";
import {
  parseCookieString,
  hasValidWeReadSession,
  extractWeReadUserInfo,
} from "./cookies";
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

// API 限流错误
export class WeReadRateLimitError extends Error {
  constructor(message = "API 调用频率超限，请稍后重试") {
    super(message);
    this.name = "WeReadRateLimitError";
  }
}

class WeReadService {
  async loginWithQRCode(): Promise<void> {
    const result = await weReadLoginWithQRCode();
    this.updateCookies(result.cookies);
    useSettingStore.getState().updateWeReadUserInfo({
      name: result.userName,
      vid: result.userVid,
      isConnected: true,
    });
    useSettingStore.getState().setWeReadLoginMethod("qr");
    useSettingStore.getState().setWeReadEnabled(true);
  }

  async loginWithCookieString(cookieString: string): Promise<void> {
    const cookies = parseCookieString(cookieString);
    if (!hasValidWeReadSession(cookies)) {
      throw new Error("无效的 Cookie，请确认已登录微信读书");
    }
    this.updateCookies(cookies);
    const userInfo = extractWeReadUserInfo(cookies);
    useSettingStore.getState().updateWeReadUserInfo(userInfo);
    useSettingStore.getState().setWeReadLoginMethod("manual");
    useSettingStore.getState().setWeReadEnabled(true);
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

      if (response.errcode === -2012) {
        const refreshed = await this.refreshCookie();
        if (!refreshed) {
          throw new Error("登录状态已过期，请重新登录微信读书");
        }
        // 重试当前请求
        continue;
      }

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

  async getMetadataList(): Promise<Metadata[]> {
    const summaries = await this.getNotebookSummaries();
    return summaries.map((summary) => parseMetadata(summary));
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

    const parserOptions = this.getParserOptions();

    const mutableMeta: Metadata = { ...metaData };
    if (detail) {
      mutableMeta.encodeId = detail.encodeId;
      mutableMeta.category = detail.category;
      mutableMeta.publisher = detail.publisher;
      mutableMeta.isbn = detail.isbn;
      mutableMeta.intro = detail.intro;
      mutableMeta.totalWords = detail.totalWords;
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

    const highlightList = parseHighlights(highlights, reviews, parserOptions);
    const reviewList = parseReviews(reviews, parserOptions);
    const chapterList = parseChapterResp(chapters, highlights);

    const chapterHighlights =
      mutableMeta.bookType === 3
        ? parseArticleHighlightReview(chapterList, highlightList, reviewList)
        : parseChapterHighlightReview(
            chapterList,
            highlightList,
            reviewList,
            parserOptions,
          );

    const bookReview = parseChapterReviews(reviews, parserOptions);

    return {
      metaData: mutableMeta,
      chapterHighlights,
      bookReview,
    };
  }

  /**
   * 只获取书籍的基础信息（详情和进度），不包含高亮和评论
   * 用于列表快速同步，减少 API 调用
   */
  async buildNotebookBasic(metaData: Metadata): Promise<Notebook> {
    const [detail, progress] = await Promise.all([
      this.getBookDetail(metaData.bookId),
      this.getBookProgress(metaData.bookId),
    ]);

    const mutableMeta: Metadata = { ...metaData };
    if (detail) {
      mutableMeta.encodeId = detail.encodeId;
      mutableMeta.category = detail.category;
      mutableMeta.publisher = detail.publisher;
      mutableMeta.isbn = detail.isbn;
      mutableMeta.intro = detail.intro;
      mutableMeta.totalWords = detail.totalWords;
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

    // 基础同步不获取高亮和评论的 synckey
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

    const parserOptions = this.getParserOptions();

    // 更新 synckeys
    const mutableMeta: Metadata = {
      ...metaData,
      synckeys: {
        ...metaData.synckeys,
        highlights: highlights?.synckey,
        reviews: reviews?.synckey,
      },
    };

    const highlightList = parseHighlights(highlights, reviews, parserOptions);
    const reviewList = parseReviews(reviews, parserOptions);
    const chapterList = parseChapterResp(chapters, highlights);

    const chapterHighlights =
      mutableMeta.bookType === 3
        ? parseArticleHighlightReview(chapterList, highlightList, reviewList)
        : parseChapterHighlightReview(
            chapterList,
            highlightList,
            reviewList,
            parserOptions,
          );

    const bookReview = parseChapterReviews(reviews, parserOptions);

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
    return this.request<HighlightResponse>({
      path: `/web/book/bookmarklist?bookId=${bookId}`,
    });
  }

  async getNotebookReviews(bookId: string): Promise<BookReviewResponse> {
    const url = `/web/review/list?bookId=${bookId}&listType=11&mine=1&synckey=0`;
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
      throw new Error("请先登录微信读书");
    }

    const mergedPayload: WeReadHttpRequestPayload = {
      ...payload,
      cookies,
    };

    const response = await weReadHttpRequest<T>(mergedPayload);
    this.maybeUpdateCookies(response.cookies);

    if (!response.ok) {
      throw new Error(`WeRead 请求失败: ${response.status}`);
    }

    // 检测 API 限流错误
    const data = response.data as any;
    if (data && typeof data === "object" && data.errcode === -10102) {
      throw new WeReadRateLimitError(data.errmsg || "API 调用频率超限");
    }

    return response.data as T;
  }

  private maybeUpdateCookies(nextCookies: WeReadCookie[]) {
    const current = this.getCookies();
    if (current.length !== nextCookies.length) {
      this.updateCookies(nextCookies);
      return;
    }

    const changed = current.some((cookie, index) => {
      const next = nextCookies[index];
      return cookie.name !== next.name || cookie.value !== next.value;
    });
    if (changed) {
      this.updateCookies(nextCookies);
    }
  }

  private updateCookies(cookies: WeReadCookie[]) {
    useSettingStore.getState().updateWeReadCookies(cookies);
    const userInfo = extractWeReadUserInfo(cookies);
    if (userInfo.isConnected) {
      useSettingStore.getState().updateWeReadUserInfo(userInfo);
    }
  }

  private getParserOptions(): WeReadParserOptions {
    const options =
      useSettingStore.getState().setting.integration.weread.options;
    return {
      convertTagsToBiLinks: options.convertTagsToBiLinks,
      showEmptyChapterTitle: options.showEmptyChapterTitle,
    };
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
    return this.request<void>({
      path: "/web/book/updateBookmark",
      method: "POST",
      body: { bookmarkId, style, colorStyle },
    });
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

      const metadata: Metadata = {
        bookId: bookId,
        encodeId: detail.encodeId,
        author: shelfBook?.author || detail.author || "",
        title: shelfBook?.title || detail.title || "",
        url: `https://weread.qq.com/web/reader/${detail.encodeId || bookId}`,
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
      console.error(`构建书籍 ${bookId} 元数据失败`, error);
      return null;
    }
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
