import log from "electron-log";
import type Database from "better-sqlite3";
import { Module } from "../types/module";
import databaseModule, { DatabaseConnectReason } from "./database";
import { onContentWritten } from "./content-events";
import EntitySearchTable from "./tables/entity-search";
import CardTable from "./tables/card";
import ArticleTable from "./tables/article";
import ProjectTable from "./tables/project";
import DiaryTable from "./tables/diary";
import PluginEntityTable, { type PluginEntityIndexDoc } from "./tables/plugin-entity";
import FTSTable from "./tables/fts";
import { listMaterialIndexDocs } from "./material-index";
import { MAIN_CONTENT_INDEX_TYPES } from "./main-content-vec-index-queue";
import ContentTable from "./tables/content";
import { MAIN_CHUNK_VERSION, type ContentSection } from "@/entity/sections";
import type { IndexType } from "@/types";
import { yieldEvery, yieldToEventLoop } from "../utils/event-loop-yield";

interface MainContentFtsIndexTask {
  id: number;
  type: IndexType;
  updateTime: number;
  content: string;
  title?: string;
  sections?: ContentSection[];
}

interface CollectTasksResult {
  tasks: MainContentFtsIndexTask[];
  removed: number;
}

type CardRow = ReturnType<typeof CardTable.getAllCards>[number];
type ArticleRow = ReturnType<typeof ArticleTable.getAllArticles>[number];
type ProjectItemRow = ReturnType<typeof ProjectTable.getAllProjectItems>[number];
type DiaryMomentRow = ReturnType<typeof DiaryTable.getAllDiarySegmentsFlat>[number];

const cardTask = async (
  db: Database.Database,
  card: CardRow
): Promise<MainContentFtsIndexTask> => ({
  ...(await ContentTable.readText(db, card.contentId, "", true)),
  id: card.id,
  type: "card",
  updateTime: Number(card.update_time || 0),
});

const articleTask = async (
  db: Database.Database,
  article: ArticleRow
): Promise<MainContentFtsIndexTask> => ({
  ...(await ContentTable.readText(db, article.contentId, article.title || "")),
  id: article.id,
  type: "article",
  title: article.title,
  updateTime: Number(article.update_time || 0),
});

const projectItemTask = async (
  db: Database.Database,
  item: ProjectItemRow
): Promise<MainContentFtsIndexTask> => ({
  ...(await ContentTable.readText(db, item.contentId, item.title || "")),
  id: item.id,
  type: "project-item",
  title: item.title,
  updateTime: Number(item.updateTime || 0),
});

const diaryMomentTask = async (
  db: Database.Database,
  moment: DiaryMomentRow
): Promise<MainContentFtsIndexTask> => ({
  ...(await ContentTable.readText(db, moment.contentId)),
  id: moment.id,
  type: "diary-moment",
  updateTime: Number(moment.updateTime || 0),
});

const pluginEntityTask = async (
  db: Database.Database,
  doc: PluginEntityIndexDoc
): Promise<MainContentFtsIndexTask> => ({
  ...(await ContentTable.readText(db, doc.contentId, doc.title)),
  id: doc.id,
  type: "plugin-entity",
  title: doc.title,
  updateTime: doc.updateTime,
});

class MainContentFtsIndexQueue implements Module {
  name = "main-content-fts-index-queue";
  private generation = 0;
  private runChain: Promise<void> = Promise.resolve();
  private static readonly COLLECT_YIELD_EVERY = 25;
  /** 正文写入合并窗口：输入期间协作投影每秒写一次，静置后再增量索引。 */
  private static readonly WRITE_DEBOUNCE_MS = 1000;
  /** 持续输入时最长等待，避免一直被防抖推迟。 */
  private static readonly WRITE_MAX_WAIT_MS = 5000;
  private readonly pendingWrites = new Map<
    string,
    { contentIds: Set<number>; timer: NodeJS.Timeout; since: number }
  >();

  async init() {
    databaseModule.onDatabaseConnected((dbName, reason) => {
      const generation = ++this.generation;
      this.pendingWrites.delete(dbName);
      this.enqueue(() => this.runReconcile(generation, dbName, reason)).catch(error => {
        log.error("[MainContentFtsIndexQueue] Reconcile failed:", error);
      });
    });
    onContentWritten(event => {
      if (event.action !== "delete") this.scheduleWrite(event.dbName, event.contentId);
    });
    log.info("[MainContentFtsIndexQueue] Module initialized");
  }

  private scheduleWrite(dbName: string, contentId: number) {
    const now = Date.now();
    const pending = this.pendingWrites.get(dbName);
    if (pending) clearTimeout(pending.timer);
    const entry = pending ?? { contentIds: new Set<number>(), since: now, timer: undefined! };
    entry.contentIds.add(contentId);
    const delay = Math.max(
      0,
      Math.min(
        MainContentFtsIndexQueue.WRITE_DEBOUNCE_MS,
        entry.since + MainContentFtsIndexQueue.WRITE_MAX_WAIT_MS - now
      )
    );
    entry.timer = setTimeout(() => {
      if (this.pendingWrites.get(dbName) !== entry) return;
      this.pendingWrites.delete(dbName);
      const generation = this.generation;
      this.enqueue(() => this.runIncremental(generation, dbName, [...entry.contentIds])).catch(
        error => log.error("[MainContentFtsIndexQueue] Incremental index failed:", error)
      );
    }, delay);
    this.pendingWrites.set(dbName, entry);
  }

  /**
   * 正文写入后的增量索引：只重建引用这些正文的实体。索引未就绪（构建中、待重建）时跳过，
   * 由连库对账兜底；删除与实体自身的元数据变化也仍由对账处理。
   */
  private async runIncremental(generation: number, dbName: string, contentIds: number[]) {
    if (this.isStale(generation)) return;
    if (databaseModule.getIndexRebuildState(dbName, "fts") !== "ready") return;
    const mainDb = databaseModule.getDatabase(dbName);
    const indexDb = databaseModule.getIndexDatabase(dbName);
    if (!mainDb || !indexDb) return;
    let indexed = 0;
    for (const refs of EntitySearchTable.locateAll(mainDb, contentIds).values()) {
      for (const ref of refs) {
        if (this.isStale(generation)) return;
        const task = await this.entityTask(mainDb, ref.kind, ref.id);
        if (this.isStale(generation) || databaseModule.getDatabase(dbName) !== mainDb) return;
        if (!task) continue;
        if (!task.content) FTSTable.removeIndexByIdAndType(indexDb, task.id, task.type);
        else if (await FTSTable.indexContent(indexDb, task)) indexed += 1;
        else log.warn(`[MainContentFtsIndexQueue] Index failed: type=${task.type}, id=${task.id}`);
        await yieldToEventLoop();
      }
    }
    log.debug(`[MainContentFtsIndexQueue] Incremental done: db=${dbName}, indexed=${indexed}`);
  }

  private async entityTask(
    mainDb: Database.Database,
    kind: string,
    id: number
  ): Promise<MainContentFtsIndexTask | null> {
    switch (kind) {
      case "card": {
        const card = CardTable.getCardById(mainDb, id);
        return card ? cardTask(mainDb, card) : null;
      }
      case "article": {
        const [article] = ArticleTable.getArticleByIds(mainDb, [id]);
        return article ? articleTask(mainDb, article) : null;
      }
      case "project-item": {
        const item = ProjectTable.getProjectItem(mainDb, id);
        return item ? projectItemTask(mainDb, item) : null;
      }
      case "diary-moment": {
        const moment = DiaryTable.getDiaryMoment(mainDb, id);
        return moment ? diaryMomentTask(mainDb, moment) : null;
      }
      case "plugin-entity": {
        const [doc] = PluginEntityTable.indexDocs(mainDb, id);
        return doc ? pluginEntityTask(mainDb, doc) : null;
      }
      default:
        return null;
    }
  }

  private async enqueue<T>(task: () => Promise<T>): Promise<T> {
    const nextTask = this.runChain.then(task, task);
    this.runChain = nextTask.then(
      () => undefined,
      () => undefined
    );
    return nextTask;
  }

  private isStale(generation: number): boolean {
    return generation !== this.generation;
  }

  private async runReconcile(generation: number, dbName: string, reason: DatabaseConnectReason) {
    const ensureResult = await databaseModule.ensureIndexDatabaseReady(dbName, `fts:${reason}`);
    if (!ensureResult) {
      log.warn(`[MainContentFtsIndexQueue] Skip reconcile, index ensure skipped: ${dbName}`);
      return;
    }

    const mainDb = databaseModule.getDatabase(dbName);
    const indexDb = databaseModule.getIndexDatabase(dbName);
    if (!mainDb || !indexDb) {
      log.warn(`[MainContentFtsIndexQueue] Database not found: ${dbName}`);
      return;
    }

    const ftsRebuildState = databaseModule.getIndexRebuildState(dbName, "fts");

    if (reason === "sync_upload_reconnect" && ftsRebuildState === "ready") {
      log.info(
        `[MainContentFtsIndexQueue] Skip reconcile after upload reconnect: db=${dbName}, rebuildState=${ftsRebuildState}`
      );
      return;
    }

    databaseModule.setIndexRebuildState(dbName, "building", "fts");

    try {
      const assertCurrent = () => {
        if (this.isStale(generation) || databaseModule.getDatabase(dbName) !== mainDb)
          throw new Error("全文索引会话已失效");
      };
      const { tasks, removed } = await this.collectTasks(mainDb, indexDb, assertCurrent);
      assertCurrent();
      log.info(
        `[MainContentFtsIndexQueue] Reconcile start: db=${dbName}, reason=${reason}, generation=${generation}, queued=${tasks.length}, removed=${removed}`
      );

      let indexed = 0;
      let failed = false;

      for (const task of tasks) {
        if (this.isStale(generation)) {
          log.info(
            `[MainContentFtsIndexQueue] Reconcile stale: db=${dbName}, reason=${reason}, generation=${generation}, indexed=${indexed}, queued=${tasks.length}, removed=${removed}`
          );
          databaseModule.setIndexRebuildState(dbName, "pending", "fts");
          return;
        }

        const ok = await FTSTable.indexContent(indexDb, {
          id: task.id,
          type: task.type,
          content: task.content,
          title: task.title,
          sections: task.sections,
          updateTime: task.updateTime,
        });

        if (ok) {
          indexed += 1;
        } else {
          failed = true;
          log.warn(`[MainContentFtsIndexQueue] Index failed: type=${task.type}, id=${task.id}`);
        }

        await new Promise<void>(resolve => {
          setImmediate(resolve);
        });
      }

      if (!failed)
        indexDb
          .prepare(
            "INSERT OR REPLACE INTO index_meta (key, value, updated_at) VALUES ('main_fts_chunk_version', ?, ?)"
          )
          .run(String(MAIN_CHUNK_VERSION), Date.now());
      databaseModule.setIndexRebuildState(dbName, failed ? "pending" : "ready", "fts");
      log.info(
        `[MainContentFtsIndexQueue] Reconcile done: db=${dbName}, reason=${reason}, generation=${generation}, queued=${tasks.length}, indexed=${indexed}, removed=${removed}`
      );
    } catch (error) {
      if (this.isStale(generation) || databaseModule.getDatabase(dbName) !== mainDb) return;
      databaseModule.setIndexRebuildState(dbName, "failed", "fts");
      throw error;
    }
  }

  private async collectTasks(
    mainDb: Database.Database,
    indexDb: Database.Database,
    assertCurrent: () => void
  ): Promise<CollectTasksResult> {
    const tasks: MainContentFtsIndexTask[] = [];
    const keep = new Set<string>();
    let removed = 0;
    let processed = 0;

    const groups: Array<() => Iterable<() => Promise<MainContentFtsIndexTask>>> = [
      () => CardTable.getAllCards(mainDb).map(card => () => cardTask(mainDb, card)),
      () => ArticleTable.getAllArticles(mainDb).map(article => () => articleTask(mainDb, article)),
      () =>
        ProjectTable.getAllProjectItems(mainDb).map(item => () => projectItemTask(mainDb, item)),
      () =>
        DiaryTable.getAllDiarySegmentsFlat(mainDb).map(
          moment => () => diaryMomentTask(mainDb, moment)
        ),
      () => PluginEntityTable.indexDocs(mainDb).map(doc => () => pluginEntityTask(mainDb, doc)),
    ];
    for (const group of groups) {
      for (const load of group()) {
        assertCurrent();
        const task = await load();
        assertCurrent();
        removed += this.appendTask(indexDb, tasks, keep, task);
        processed += 1;
        await yieldEvery(processed, MainContentFtsIndexQueue.COLLECT_YIELD_EVERY);
      }
      await yieldToEventLoop();
    }

    const materials = await listMaterialIndexDocs(mainDb);
    for (const doc of materials) {
      assertCurrent();
      removed += this.appendTask(indexDb, tasks, keep, doc);
      processed += 1;
      await yieldEvery(processed, MainContentFtsIndexQueue.COLLECT_YIELD_EVERY);
    }

    // 已不是候选的（实体已删、摘录软删、剪藏变孤儿）删掉，检索不再命中
    assertCurrent();
    removed += FTSTable.removeIndexesNotIn(indexDb, keep, MAIN_CONTENT_INDEX_TYPES);

    return { tasks, removed };
  }

  private appendTask(
    indexDb: Database.Database,
    tasks: MainContentFtsIndexTask[],
    keep: Set<string>,
    task: MainContentFtsIndexTask
  ): number {
    if (task.content) keep.add(`${task.type}:${task.id}`);
    const indexInfo = FTSTable.checkIndexExists(indexDb, task.id, task.type);

    if (!task.content) {
      if (indexInfo) {
        FTSTable.removeIndexByIdAndType(indexDb, task.id, task.type);
        return 1;
      }
      return 0;
    }

    const version = indexDb
      .prepare("SELECT value FROM index_meta WHERE key = 'main_fts_chunk_version'")
      .get() as { value: string } | undefined;
    if (
      version?.value !== String(MAIN_CHUNK_VERSION) ||
      !indexInfo ||
      indexInfo.updateTime < task.updateTime
    ) {
      tasks.push(task);
    }

    return 0;
  }
}

export default new MainContentFtsIndexQueue();
