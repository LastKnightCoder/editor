import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  JsonValue,
  PluginContext,
  PluginExcerptEntry,
  PluginExcerptItem,
  PluginExcerptSource,
} from "@tau/plugins";
import { WeReadRuntime, notebookFromEntries } from "../src/runtime";
import type { ChapterHighlightReview, Metadata } from "../src/service/types";

/** 与宿主同语义的内存摘录：按 externalId 合并，缺席软删除，id 稳定 */
function fakeContext() {
  const store = new Map<string, JsonValue>();
  const rows = new Map<string, PluginExcerptEntry & { source: string; title: string }>();
  let nextId = 1;
  const replaced: string[] = [];
  const excerpts = {
    register: vi.fn(() => ({ dispose: () => undefined })),
    replace: vi.fn(async (source: PluginExcerptSource, items: PluginExcerptItem[]) => {
      replaced.push(source.key);
      const seen = new Set(items.map(item => item.externalId));
      for (const item of items) {
        const prev = rows.get(item.externalId);
        rows.set(item.externalId, {
          ref: prev?.ref ?? { kind: "excerpt", id: nextId++ },
          externalId: item.externalId,
          quote: item.quote,
          note: item.note ?? "",
          location: item.location ?? "",
          url: item.url ?? source.url ?? null,
          anchor: item.anchor ?? null,
          color: item.color ?? null,
          time: item.time ?? null,
          deleted: false,
          source: source.key,
          title: source.title,
        });
      }
      for (const row of rows.values())
        if (row.source === source.key && !seen.has(row.externalId)) row.deleted = true;
      return { inserted: 0, updated: 0, deleted: 0 };
    }),
    patch: vi.fn(),
    sources: vi.fn(async () => {
      const map = new Map<string, { key: string; title: string; count: number }>();
      for (const row of rows.values()) {
        const item = map.get(row.source) ?? { key: row.source, title: row.title, count: 0 };
        if (!row.deleted) item.count += 1;
        map.set(row.source, item);
      }
      return [...map.values()];
    }),
    items: vi.fn(async (key: string) => [...rows.values()].filter(row => row.source === key)),
  };
  const context = {
    pluginId: "weread",
    workspaceId: "w",
    signal: new AbortController().signal,
    register: () => ({ dispose: () => undefined }),
    fetch: vi.fn(),
    storage: {
      get: async (key: string) => store.get(key),
      set: async (key: string, value: JsonValue) => void store.set(key, value),
      delete: async (key: string) => void store.delete(key),
    },
    excerpts,
  } as unknown as PluginContext;
  return { context, store, rows, replaced, excerpts };
}

const meta = (bookId: string, extra: Partial<Metadata> = {}): Metadata => ({
  bookId,
  title: `书${bookId}`,
  author: "",
  cover: "",
  bookType: 0,
  publishTime: "",
  noteCount: 1,
  reviewCount: 0,
  lastReadDate: "",
  webUrl: `https://weread.qq.com/web/reader/${bookId}`,
  ...extra,
});

const chapter = (bookmarkId: string, text: string): ChapterHighlightReview => ({
  chapterUid: 3,
  chapterIdx: 1,
  chapterTitle: "第一章",
  level: 1,
  isMPChapter: 0,
  highlights: [
    {
      bookmarkId,
      created: 1_700_000_000,
      createTime: "",
      chapterUid: 3,
      chapterIdx: 1,
      chapterTitle: "第一章",
      markText: text,
      style: 0,
      colorStyle: 2,
      range: "1-5",
    },
  ],
});

const notes = (chapters: ChapterHighlightReview[]) => ({
  chapterHighlights: chapters,
  bookReview: { chapterReviews: [], bookReviews: [] },
});

let fake: ReturnType<typeof fakeContext>;
let runtime: WeReadRuntime;

beforeEach(async () => {
  fake = fakeContext();
  fake.store.set("apiKey", "key");
  runtime = new WeReadRuntime(fake.context);
  vi.spyOn(runtime.client, "validateSession").mockResolvedValue();
  vi.spyOn(runtime, "sync").mockResolvedValueOnce(null);
  await runtime.load();
});

describe("WeReadRuntime", () => {
  it("同步：写入元数据缓存；指纹变化的书按书写摘录，来源带书名与网页链接", async () => {
    vi.spyOn(runtime.client, "syncMetadata").mockResolvedValue({
      metadataList: [meta("A"), meta("B")],
      failedBookIds: [],
      bookArchiveInfo: {},
      removedBookIds: [],
      requested: 2,
      noteFingerprints: { A: { sort: 10, count: 1 } },
    });
    vi.spyOn(runtime.client, "fetchNotes").mockResolvedValue(notes([chapter("bm1", "甲")]));
    expect(await runtime.sync()).toEqual({ total: 2, updated: 2, failed: 0 });
    expect(fake.excerpts.replace).toHaveBeenCalledWith(
      { key: "A", title: "书A", url: "https://weread.qq.com/web/reader/A" },
      [expect.objectContaining({ externalId: "A:bm1", quote: "甲", location: "第一章" })]
    );
    expect(runtime.getState().books.map(book => book.bookId)).toEqual(["A", "B"]);
    expect(runtime.getState().books[0].synckeys).toMatchObject({ highlights: 10, reviews: 1 });
    expect((fake.store.get("shelf") as { books: unknown[] }).books).toHaveLength(2);
  });

  it("拉回为空而 Tau 已有摘录时视为限流：不清空、不记指纹", async () => {
    await fake.excerpts.replace({ key: "A", title: "书A" }, [{ externalId: "A:bm1", quote: "甲" }]);
    fake.excerpts.replace.mockClear();
    vi.spyOn(runtime.client, "syncMetadata").mockResolvedValue({
      metadataList: [meta("A")],
      failedBookIds: [],
      bookArchiveInfo: {},
      removedBookIds: [],
      requested: 1,
      noteFingerprints: { A: { sort: 20, count: 1 } },
    });
    vi.spyOn(runtime.client, "fetchNotes").mockResolvedValue(notes([]));
    await runtime.sync();
    expect(fake.excerpts.replace).not.toHaveBeenCalled();
    expect(runtime.getState().books[0].synckeys?.highlights).toBeUndefined();
  });

  it("书从账号消失、或已无笔记：摘录整本下架（软删除），id 保留供引用", async () => {
    await fake.excerpts.replace({ key: "A", title: "书A" }, [{ externalId: "A:bm1", quote: "甲" }]);
    await fake.excerpts.replace({ key: "B", title: "书B" }, [{ externalId: "B:bm1", quote: "乙" }]);
    const ids = [...fake.rows.values()].map(row => row.ref.id);
    vi.spyOn(runtime.client, "syncMetadata").mockResolvedValue({
      metadataList: [meta("A")],
      failedBookIds: [],
      bookArchiveInfo: {},
      removedBookIds: ["B"],
      requested: 1,
      noteFingerprints: {},
    });
    await runtime.sync();
    expect([...fake.rows.values()].map(row => [row.ref.id, row.deleted])).toEqual([
      [ids[0], true],
      [ids[1], true],
    ]);
  });

  it("未连接时单书页从摘录还原笔记，划线与只有想法的条目都归位", async () => {
    await runtime.saveApiKey("");
    await fake.excerpts.replace({ key: "A", title: "书A" }, [
      {
        externalId: "A:bm1",
        quote: "甲",
        note: "想法",
        location: "第一章",
        anchor: { chapterUid: 3, chapterIdx: 1, chapterTitle: "第一章", range: "1-5" },
      },
      {
        externalId: "A:review:r1",
        quote: "摘",
        note: "只有想法",
        location: "第一章",
        anchor: { chapterUid: 3, chapterIdx: 1, chapterTitle: "第一章", range: "6-9" },
      },
    ]);
    const restored = notebookFromEntries(meta("A"), await fake.excerpts.items("A"));
    expect(restored.chapterHighlights).toHaveLength(1);
    expect(restored.chapterHighlights[0].highlights?.[0]).toMatchObject({
      bookmarkId: "bm1",
      markText: "甲",
      reviewContent: "想法",
    });
    expect(restored.chapterHighlights[0].chapterReviews?.[0]).toMatchObject({
      reviewId: "r1",
      abstract: "摘",
      content: "只有想法",
    });
  });

  it("单书已连接：拉最新详情写回摘录与元数据，返回带 Tau 地址的条目", async () => {
    runtime["state"] = { ...runtime.getState(), books: [meta("A")] };
    vi.spyOn(runtime.client, "fetchNotebookDetail").mockResolvedValue({
      metaData: meta("A", { title: "新书名" }),
      ...notes([chapter("bm1", "甲")]),
    });
    const detail = await runtime.loadBook("A");
    expect(detail?.fresh).toBe(true);
    expect(detail?.entries.map(entry => entry.externalId)).toEqual(["A:bm1"]);
    expect(runtime.getState().books[0].title).toBe("新书名");
    expect(fake.replaced).toContain("A");
  });

  it("偏好与 Key 落在插件存储；非法偏好回落默认值", async () => {
    runtime.setPrefs({ layout: "list" });
    await Promise.resolve();
    expect(fake.store.get("prefs")).toEqual({ layout: "list", sort: "last", tocOpen: true });
    fake.store.set("prefs", { layout: "x", sort: 3 });
    const next = new WeReadRuntime(fake.context);
    vi.spyOn(next.client, "validateSession").mockResolvedValue();
    vi.spyOn(next, "sync").mockResolvedValue(null);
    await next.load();
    expect(next.getState().prefs).toEqual({ layout: "cover", sort: "last", tocOpen: true });
    expect(next.getState().apiKey).toBe("key");
    expect(next.getState().connection).toBe("valid");
  });
});
