import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Metadata } from "../src/service/types";
import { WeReadClient } from "../src/service";

const fetchMock = vi.fn();
const weReadService = new WeReadClient({
  fetch: async (...args: Parameters<typeof fetch>) => {
    const result = await fetchMock(...args);
    return new Response(JSON.stringify(result.data), { status: result.status });
  },
  getApiKey: () => "wrk-test",
});

type Body = { api_name: string; bookId?: string };

const shelf = {
  books: [
    { bookId: "A", title: "没变的书", author: "甲", cover: "a.jpg", readUpdateTime: 100 },
    { bookId: "B", title: "又读过的书", author: "乙", cover: "b.jpg", readUpdateTime: 300 },
    { bookId: "C", title: "新书", author: "丙", cover: "c.jpg", readUpdateTime: 50 },
  ],
  albums: [],
  archive: [{ archiveId: 1, name: "小说", bookIds: ["A"] }],
};
const notebooks = {
  books: [
    {
      bookId: "A",
      book: { title: "没变的书", author: "甲", cover: "a.jpg" },
      sort: 90,
      noteCount: 7,
      reviewCount: 2,
      bookmarkCount: 0,
    },
  ],
  hasMore: 0,
};

const cachedMeta = (
  bookId: string,
  fingerprint: number,
  extra: Partial<Metadata> = {}
): Metadata => ({
  bookId,
  title: `旧${bookId}`,
  author: "",
  cover: `${bookId}.jpg`,
  bookType: 0,
  publishTime: "",
  noteCount: 1,
  reviewCount: 0,
  lastReadDate: "2026-01-01",
  publisher: "旧出版社",
  synckeys: { progress: fingerprint },
  readInfo: { readingProgress: 30, readingTime: 600, readingBookDate: 0, finishedDate: 0 },
  ...extra,
});

let failDetail = new Set<string>();

function route() {
  fetchMock.mockImplementation(async (_url: string, { body }: { body: string }) => {
    const data: Body = JSON.parse(body);
    switch (data.api_name) {
      case "/shelf/sync":
        return { status: 200, data: shelf };
      case "/user/notebooks":
        return { status: 200, data: notebooks };
      case "/book/info":
        if (failDetail.has(data.bookId!)) return { status: 500, data: {} };
        return {
          status: 200,
          data: { bookId: data.bookId, title: `新${data.bookId}`, publisher: "新出版社" },
        };
      case "/book/getprogress":
        if (failDetail.has(data.bookId!)) return { status: 500, data: {} };
        return {
          status: 200,
          data: { bookId: data.bookId, book: { progress: 80, readingTime: 7200 } },
        };
      default:
        throw new Error(`unexpected ${data.api_name}`);
    }
  });
}

const detailCalls = () =>
  fetchMock.mock.calls
    .map(([, arg]) => JSON.parse(arg.body) as Body)
    .filter(b => b.api_name === "/book/info")
    .map(b => b.bookId)
    .sort();

describe("services/weread syncMetadata（增量同步）", () => {
  beforeEach(() => {
    failDetail = new Set();
    route();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const cached = [cachedMeta("A", 100), cachedMeta("B", 200), cachedMeta("D", 10)];

  it("只补拉新书和最近阅读时间变化的书，其余沿用缓存并更新书架字段", async () => {
    const result = await weReadService.syncMetadata(cached);

    expect(detailCalls()).toEqual(["B", "C"]);
    expect(result.requested).toBe(2);
    expect(result.removedBookIds).toEqual(["D"]);
    expect(result.presentBookIds.sort()).toEqual(["A", "B", "C"]);

    const byId = new Map(result.metadataList.map(m => [m.bookId, m]));
    expect(byId.get("A")).toMatchObject({
      publisher: "旧出版社",
      noteCount: 7,
      reviewCount: 2,
      archiveName: "小说",
      synckeys: { progress: 100 },
      readInfo: { readingProgress: 30 },
    });
    expect(byId.get("B")).toMatchObject({
      publisher: "新出版社",
      synckeys: { progress: 300 },
      readInfo: { readingProgress: 80, readingTime: 7200 },
    });
    expect(byId.get("C")?.synckeys?.progress).toBe(50);
  });

  it("full 时全部重新补拉", async () => {
    await weReadService.syncMetadata(cached, { full: true });
    expect(detailCalls()).toEqual(["A", "B", "C"]);
  });

  it("分页未结束却返回空页或游标停滞时拒绝不完整书单", async () => {
    fetchMock.mockResolvedValue({ status: 200, data: { books: [], hasMore: 1 } });
    await expect(weReadService.getNotebookSummaries()).rejects.toThrow("分页未完成");
    fetchMock.mockResolvedValue({ status: 200, data: { ...notebooks, hasMore: 1 } });
    await expect(weReadService.getNotebookSummaries()).rejects.toThrow("分页未完成");
    fetchMock.mockResolvedValue({ status: 200, data: {} });
    await expect(weReadService.getNotebookSummaries()).rejects.toThrow("书单不完整");
  });

  it("补拉失败时保留缓存详情、不更新指纹，下次同步会重试", async () => {
    failDetail.add("B");
    const result = await weReadService.syncMetadata(cached);
    const b = result.metadataList.find(m => m.bookId === "B");
    expect(b).toMatchObject({ publisher: "旧出版社", synckeys: { progress: 200 } });
    expect(result.failedBookIds).toContain("B");
  });
});
