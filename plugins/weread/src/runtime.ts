/**
 * 一次启用的运行时：API Key 与书架缓存（插件私有存储）、连接状态、书架同步与单书笔记。
 *
 * 划线与想法的事实源是 Tau 摘录（context.excerpts）：同步按书 replace，书从账号消失即整本下架；
 * 插件只缓存书籍元数据与笔记指纹，未连接时单书页从摘录还原笔记。
 */

import { QueryClient } from "@tanstack/react-query";
import type {
  JsonValue,
  PluginContext,
  PluginExcerptEntry,
  PluginExcerptSource,
} from "@tau/plugins";
import { WeReadClient, type NoteFingerprint } from "./service";
import type { ChapterHighlightReview, Metadata, Notebook, Review } from "./service/types";
import { expandWeReadExcerpts } from "./excerpts";
import { hasNotes, planNoteSync, preferNonEmpty, type ShelfLayout, type ShelfSort } from "./model";

export type Connection = "none" | "checking" | "valid" | "invalid";

export interface Prefs {
  layout: ShelfLayout;
  sort: ShelfSort;
  tocOpen: boolean;
}

const DEFAULT_PREFS: Prefs = { layout: "cover", sort: "last", tocOpen: true };
const LAYOUTS: ShelfLayout[] = ["cover", "list"];
const SORTS: ShelfSort[] = ["last", "progress", "minutes", "notes"];

function parsePrefs(value: JsonValue | undefined): Prefs {
  const raw = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<
    string,
    JsonValue
  >;
  return {
    layout: LAYOUTS.includes(raw.layout as ShelfLayout)
      ? (raw.layout as ShelfLayout)
      : DEFAULT_PREFS.layout,
    sort: SORTS.includes(raw.sort as ShelfSort) ? (raw.sort as ShelfSort) : DEFAULT_PREFS.sort,
    tocOpen: typeof raw.tocOpen === "boolean" ? raw.tocOpen : DEFAULT_PREFS.tocOpen,
  };
}

export interface RuntimeState {
  apiKey: string;
  connection: Connection;
  connectionError: string;
  books: Metadata[];
  lastSyncedAt: number | null;
  loaded: boolean;
  syncing: boolean;
  progress: { completed: number; total: number } | null;
  prefs: Prefs;
}

export interface SyncOutcome {
  total: number;
  updated: number;
  failed: number;
}

export interface BookDetail {
  notebook: Notebook;
  /** 本次是否从微信读书拉到了最新笔记（否则是 Tau 中的摘录） */
  fresh: boolean;
  error: string | null;
  /** Tau 中这本书的摘录，按 externalId 找到条目地址 */
  entries: PluginExcerptEntry[];
}

const SHELF_KEY = "shelf";
const API_KEY = "apiKey";
const PREFS_KEY = "prefs";
const NOTE_SYNC_CONCURRENCY = 2;
const emptyNotes = { chapterHighlights: [], bookReview: { chapterReviews: [], bookReviews: [] } };

/** 存储只收 JSON：去掉 undefined 字段 */
const toJson = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;

export const sourceOf = (meta: Pick<Metadata, "bookId" | "title" | "webUrl" | "url">) => {
  const url = meta.webUrl || meta.url;
  return {
    key: meta.bookId,
    title: meta.title ?? "",
    ...(url && /^https?:\/\//.test(url) ? { url } : {}),
  } satisfies PluginExcerptSource;
};

/** 新元数据并入缓存：去掉已不在书架与笔记本里的书 */
function mergeMetadata(existing: Metadata[], metas: Metadata[], removed: Set<string>): Metadata[] {
  const map = new Map(existing.map(meta => [meta.bookId, meta]));
  for (const bookId of removed) map.delete(bookId);
  for (const meta of metas) map.set(meta.bookId, meta);
  return [...map.values()];
}

/** 未连接时从摘录还原单书笔记：划线 / 只有想法的摘录按章节归位（整书书评与无原文想法不在摘录里） */
export function notebookFromEntries(meta: Metadata, entries: PluginExcerptEntry[]): Notebook {
  const chapters = new Map<number, ChapterHighlightReview>();
  const prefix = `${meta.bookId}:`;
  for (const entry of entries) {
    if (entry.deleted || !entry.externalId.startsWith(prefix)) continue;
    const anchor = entry.anchor ?? {};
    const chapterUid = typeof anchor.chapterUid === "number" ? anchor.chapterUid : 0;
    const chapterIdx = typeof anchor.chapterIdx === "number" ? anchor.chapterIdx : 0;
    const range = typeof anchor.range === "string" ? anchor.range : "";
    let chapter = chapters.get(chapterUid);
    if (!chapter) {
      chapter = {
        chapterUid,
        chapterIdx,
        chapterTitle: entry.location,
        level: 1,
        isMPChapter: 0,
        highlights: [],
        chapterReviews: [],
      };
      chapters.set(chapterUid, chapter);
    }
    const id = entry.externalId.slice(prefix.length);
    const created = entry.time ? Math.round(entry.time / 1000) : 0;
    if (id.startsWith("review:")) {
      chapter.chapterReviews!.push({
        reviewId: id.slice("review:".length),
        chapterUid,
        created,
        createTime: "",
        content: entry.note,
        abstract: entry.quote,
        range,
        type: 1,
      } satisfies Review);
    } else {
      chapter.highlights!.push({
        bookmarkId: id,
        created,
        createTime: "",
        chapterUid,
        chapterIdx,
        chapterTitle: entry.location,
        markText: entry.quote,
        style: 0,
        colorStyle: Number(entry.color ?? 0) || 0,
        reviewContent: entry.note,
        range,
      });
    }
  }
  return {
    metaData: meta,
    chapterHighlights: [...chapters.values()].sort(
      (a, b) => (a.chapterIdx ?? 0) - (b.chapterIdx ?? 0)
    ),
    bookReview: { chapterReviews: [], bookReviews: [] },
  };
}

export class WeReadRuntime {
  readonly queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  readonly client: WeReadClient;
  private state: RuntimeState = {
    apiKey: "",
    connection: "none",
    connectionError: "",
    books: [],
    lastSyncedAt: null,
    loaded: false,
    syncing: false,
    progress: null,
    prefs: DEFAULT_PREFS,
  };
  private readonly listeners = new Set<() => void>();
  private validation = 0;

  constructor(readonly context: PluginContext) {
    this.client = new WeReadClient({ fetch: context.fetch, getApiKey: () => this.state.apiKey });
    context.register({ dispose: () => this.queryClient.clear() });
  }

  getState = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  private set(patch: Partial<RuntimeState>) {
    if (this.context.signal.aborted) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** 读取存储；已有 Key 时校验并后台同步一次 */
  async load(): Promise<void> {
    const [apiKey, shelf, prefs] = await Promise.all([
      this.context.storage.get(API_KEY),
      this.context.storage.get(SHELF_KEY),
      this.context.storage.get(PREFS_KEY),
    ]);
    const saved = (shelf ?? null) as { books?: Metadata[]; lastSyncedAt?: number | null } | null;
    this.set({
      apiKey: typeof apiKey === "string" ? apiKey : "",
      books: Array.isArray(saved?.books) ? saved.books : [],
      lastSyncedAt: typeof saved?.lastSyncedAt === "number" ? saved.lastSyncedAt : null,
      prefs: parsePrefs(prefs),
      loaded: true,
    });
    if (this.state.apiKey && (await this.validate()))
      void this.sync({ silent: true }).catch(error => {
        if (!this.context.signal.aborted) console.error("[weread] 后台同步失败", error);
      });
  }

  /** 校验当前 Key；并发时以最后一次为准 */
  async validate(): Promise<boolean> {
    const run = ++this.validation;
    if (!this.state.apiKey) {
      this.set({ connection: "none", connectionError: "" });
      return false;
    }
    this.set({ connection: "checking", connectionError: "" });
    try {
      await this.client.validateSession();
      if (run === this.validation) this.set({ connection: "valid" });
      return run === this.validation;
    } catch (error) {
      if (run === this.validation)
        this.set({
          connection: "invalid",
          connectionError: error instanceof Error ? error.message : "微信读书 API Key 校验失败",
        });
      return false;
    }
  }

  /** 保存 Key 并校验；空串即断开 */
  async saveApiKey(value: string): Promise<boolean> {
    const apiKey = value.trim();
    if (/[\r\n]/.test(apiKey)) throw new Error("API Key 格式无效");
    await this.context.storage.set(API_KEY, apiKey);
    this.set({ apiKey });
    this.queryClient.removeQueries({ queryKey: ["book"] });
    return this.validate();
  }

  /** 偏好先更新界面再保存；保存失败只记日志，下次启用回到上次保存的值 */
  setPrefs(patch: Partial<Prefs>) {
    const prefs = { ...this.state.prefs, ...patch };
    this.set({ prefs });
    void this.context.storage
      .set(PREFS_KEY, toJson(prefs))
      .catch(error => console.error("[weread] 保存偏好失败", error));
  }

  private async saveShelf(books: Metadata[], lastSyncedAt: number | null) {
    await this.context.storage.set(SHELF_KEY, toJson({ version: 1, books, lastSyncedAt }));
    this.set({ books, lastSyncedAt });
  }

  /**
   * 同步书架（默认增量：只对新书和最近读过 / 新记笔记的书补拉详情）；full = 全部重拉。
   * 再对笔记指纹变化的书拉划线与想法，按书写入摘录。同一时刻只跑一轮。
   */
  async sync({ silent = false, full = false } = {}): Promise<SyncOutcome | null> {
    if (this.state.syncing || this.state.connection !== "valid") return null;
    this.set({ syncing: true, progress: silent ? null : { completed: 0, total: 0 } });
    const onProgress = silent
      ? undefined
      : (progress: { completed: number; total: number }) => this.set({ progress });
    try {
      const cached = this.state.books;
      const result = await this.client.syncMetadata(cached, { full, onProgress });
      if (result.metadataList.length === 0 && cached.length > 0)
        throw new Error("没有获取到任何书籍信息");
      const removed = new Set(result.removedBookIds);
      let books = mergeMetadata(cached, result.metadataList, removed);
      // 详情补拉最耗请求，先落盘，笔记阶段中断也不必重来
      await this.saveShelf(books, this.state.lastSyncedAt);

      const notes = await this.syncNotes(books, result.noteFingerprints, full, onProgress);
      books = notes.books;
      await this.retireMissingSources(books, cached);
      await this.saveShelf(books, Date.now());
      const failed = result.failedBookIds.length + notes.failed;
      return { total: books.length, updated: result.requested - failed, failed };
    } finally {
      this.set({ syncing: false, progress: null });
    }
  }

  /** 指纹变了的书拉笔记并写摘录；拉回为空而 Tau 已有摘录的视为限流，不记指纹下次重试 */
  private async syncNotes(
    books: Metadata[],
    fingerprints: Record<string, NoteFingerprint>,
    full: boolean,
    onProgress?: (progress: { completed: number; total: number }) => void
  ): Promise<{ books: Metadata[]; failed: number }> {
    const { fetch } = planNoteSync(
      books.map(metaData => ({ metaData, ...emptyNotes })),
      fingerprints,
      full
    );
    const byId = new Map(books.map(meta => [meta.bookId, meta]));
    const counts = new Map(
      (await this.context.excerpts.sources()).map(source => [source.key, source.count])
    );
    // 笔记本概览里没有的书已无笔记：Tau 里还有它的摘录就下架
    const clear = books
      .filter(meta => !fingerprints[meta.bookId] && (counts.get(meta.bookId) ?? 0) > 0)
      .map(meta => meta.bookId);
    const remember = (bookId: string, fingerprint: NoteFingerprint) => {
      const meta = byId.get(bookId);
      if (meta)
        byId.set(bookId, {
          ...meta,
          synckeys: { ...meta.synckeys, highlights: fingerprint.sort, reviews: fingerprint.count },
        });
    };

    for (const bookId of clear) {
      const meta = byId.get(bookId);
      if (!meta) continue;
      await this.context.excerpts.replace(sourceOf(meta), []);
      remember(bookId, { sort: 0, count: 0 });
    }

    let completed = 0;
    let failed = 0;
    const queue = [...fetch];
    const worker = async () => {
      for (let bookId = queue.shift(); bookId; bookId = queue.shift()) {
        this.context.signal.throwIfAborted();
        const meta = byId.get(bookId);
        if (!meta) continue;
        try {
          const notes = await this.client.fetchNotes(bookId);
          const items = expandWeReadExcerpts(bookId, notes.chapterHighlights);
          if (items.length || !(counts.get(bookId) ?? 0)) {
            await this.context.excerpts.replace(sourceOf(meta), items);
            remember(bookId, fingerprints[bookId]);
          }
        } catch (error) {
          if (this.context.signal.aborted) throw error;
          failed += 1;
          console.error("[weread] 拉取划线失败", bookId, error);
        }
        completed += 1;
        onProgress?.({ completed, total: fetch.length });
      }
    };
    await Promise.all(Array.from({ length: NOTE_SYNC_CONCURRENCY }, worker));
    return { books: books.map(meta => byId.get(meta.bookId) ?? meta), failed };
  }

  /** 书架与笔记本里都不再有的书：它的摘录整本下架（软删除，书回来时原样复位） */
  private async retireMissingSources(books: Metadata[], cached: Metadata[]) {
    const present = new Set(books.map(meta => meta.bookId));
    const titles = new Map(cached.map(meta => [meta.bookId, meta]));
    for (const source of await this.context.excerpts.sources()) {
      if (present.has(source.key) || source.count === 0) continue;
      const meta = titles.get(source.key);
      await this.context.excerpts.replace(
        meta ? sourceOf(meta) : { key: source.key, title: source.title },
        []
      );
    }
  }

  /** 单书：已连接时拉最新详情并写回摘录，否则从摘录还原 */
  async loadBook(bookId: string): Promise<BookDetail | null> {
    const meta = this.state.books.find(book => book.bookId === bookId);
    if (!meta) return null;
    const entries = await this.context.excerpts.items(bookId);
    const cached = notebookFromEntries(meta, entries);
    if (this.state.connection !== "valid")
      return { notebook: cached, fresh: false, error: null, entries };
    try {
      const fetched = await this.client.fetchNotebookDetail({ metaData: meta, ...emptyNotes });
      // 详情带回最新元数据；笔记指纹归书架同步维护
      const updated = { ...fetched.metaData, synckeys: meta.synckeys };
      const books = this.state.books.map(book => (book.bookId === bookId ? updated : book));
      await this.saveShelf(books, this.state.lastSyncedAt);
      const notebook = preferNonEmpty(cached, { ...fetched, metaData: updated });
      if (hasNotes(fetched)) {
        await this.context.excerpts.replace(
          sourceOf(updated),
          expandWeReadExcerpts(bookId, fetched.chapterHighlights)
        );
        return {
          notebook,
          fresh: true,
          error: null,
          entries: await this.context.excerpts.items(bookId),
        };
      }
      return { notebook, fresh: true, error: null, entries };
    } catch (error) {
      if (this.context.signal.aborted) throw error;
      return {
        notebook: cached,
        fresh: false,
        error: error instanceof Error ? error.message : "拉取笔记失败",
        entries,
      };
    }
  }
}
