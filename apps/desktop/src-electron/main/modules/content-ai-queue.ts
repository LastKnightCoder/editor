/**
 * 笔记元信息队列（KL-053 / KL-054 / KL-055）：为卡片、文章、项目文档的正文生成 AI 元信息，写进主库 content_ai_meta。
 *
 * - 功能槽 contentMetadata 配上即处理全部、清空即停止；没有其他开关，进度只在设置页显示。
 * - 连库对账：清孤儿行，找出没有元信息、结构版本过低、或正文在上次生成 / 核对之后改过的正文，按更新时间倒序处理。
 * - 增量：正文写入总线触发，静置 IDLE_MS 后再判断；协作投影每秒都发事件，这里只记最后写入时间。
 * - 正文改过不等于重算：纯文本 MinHash 相似度低于阈值才调模型，否则只记核对时间（标题稳定）。
 * - 串行、每次一份；切库或换槽作废进行中的一轮；单份失败重试 2 次后跳过并记入 index_meta，下次连库再试。
 */

import type Database from "better-sqlite3";
import { ipcMain } from "electron";
import log from "electron-log";
import type { Descendant } from "slate";
import {
  DIGEST_RECOMPUTE_THRESHOLD,
  contentPlainText,
  digestSimilarity,
  textDigest,
} from "@/entity/text-digest";
import type { ContentAiStatus } from "@/types/content-ai";
import type { PiSingleShotRequest } from "@/types/pi-llm";
import type { Module } from "../types/module";
import { onContentWritten } from "./content-events";
import databaseModule from "./database";
import { broadcastDatabaseChange } from "./database-notifications";
import PiAiRuntimeModule from "./pi-ai-runtime";
import userSettingModule from "./user-setting";
import {
  CONTENT_AI_SYSTEM_PROMPT,
  INPUT_MAX_CHARS,
  buildContentAiUserPrompt,
  parseContentAiOutput,
  type ContentAiKind,
} from "./content-ai-prompt";
import { resolveUsageSlot, type LlmRef, type SettingForLlmSlots } from "./llm-usage-slot";
import ContentAiMetaTable, {
  CONTENT_AI_META_CHANGED_EVENT,
  CONTENT_AI_META_SCHEMA_VER,
} from "./tables/content-ai-meta";
import ContentTable from "./tables/content";

export const CONTENT_AI_SLOT = "contentMetadata";
const FAILURES_META_KEY = "content_ai_failures";
/** 编辑静置多久再判断是否重算 */
export const IDLE_MS = 10 * 60_000;
const SWEEP_MS = 60_000;
/** 每份正文最多调用几次（首次 + 重试 2 次） */
const MAX_ATTEMPTS = 3;
/** 连续这么多份失败视为全局问题（密钥失效、断网、额度用尽），停掉本轮 */
const ABORT_AFTER_CONSECUTIVE_FAILURES = 5;
const NOTIFY_THROTTLE_MS = 2_000;
const MAX_FAILURE_RECORDS = 200;
/** token 估算：每字约 1 token，另加提示词与输出 */
const TOKENS_PER_CHAR = 1;
const TOKENS_OVERHEAD = 400;

const KIND_BY_RANK: ContentAiKind[] = ["card", "article", "project-item"];
const EMPTY_META = { title: "", summary: "", concepts: [], claims: [] };

/** 范围：卡片、未删文章、项目文档的正文；共用正文按 卡片 > 文章 > 项目文档 取一种身份 */
const SCOPE_SQL = `
  SELECT content_id, MIN(rank) AS rank FROM (
    SELECT content_id, 0 AS rank FROM cards WHERE content_id IS NOT NULL
    UNION ALL SELECT content_id, 1 FROM articles WHERE is_delete = 0 AND content_id IS NOT NULL
    UNION ALL SELECT content_id, 2 FROM project_item
      WHERE project_item_type = 'document' AND content_id IS NOT NULL
  ) GROUP BY content_id`;

interface Candidate {
  id: number;
  updateTime: number;
  count: number;
  rank: number;
  schemaVer: number | null;
  metaTime: number | null;
}

export interface ContentAiDatabases {
  mainDb: Database.Database;
  indexDb: Database.Database | null;
}

export interface ContentAiDeps {
  /** 当前库名对应的库；库未连接返回 null */
  databases(dbName: string): Promise<ContentAiDatabases | null>;
  complete(
    request: Omit<PiSingleShotRequest, "requestId">,
    signal: AbortSignal
  ): Promise<{ ok: boolean; text: string; error?: string }>;
  /** 元信息有变化（节流后调用） */
  notifyChanged(dbName: string): void;
  sleep(ms: number): Promise<void>;
  now(): number;
}

type Outcome = "generated" | "checked" | "skipped" | "failed";

interface FailureRecord {
  contentId: number;
  error: string;
  at: number;
}

const yieldToEventLoop = () => new Promise<void>(resolve => setImmediate(resolve));

/** 全部候选及其元信息状态（不读正文，2 万份也是一次查询） */
export function listCandidates(mainDb: Database.Database, ids?: number[]): Candidate[] {
  const select = `SELECT ct.id, ct.update_time AS updateTime, ct.count, s.rank,
      m.schema_ver AS schemaVer, m.update_time AS metaTime
    FROM (${SCOPE_SQL}) s JOIN contents ct ON ct.id = s.content_id
    LEFT JOIN content_ai_meta m ON m.content_id = ct.id
    WHERE ct.count > 0`;
  if (!ids) return mainDb.prepare(select).all() as Candidate[];
  const result: Candidate[] = [];
  for (let start = 0; start < ids.length; start += 500) {
    const batch = ids.slice(start, start + 500);
    result.push(
      ...(mainDb
        .prepare(`${select} AND ct.id IN (${batch.map(() => "?").join(",")})`)
        .all(...batch) as Candidate[])
    );
  }
  return result;
}

/** 需要处理：没有元信息、结构版本过低，或正文在上次生成 / 核对之后改过 */
export const needsWork = (candidate: Candidate) =>
  candidate.metaTime === null ||
  (candidate.schemaVer ?? 0) < CONTENT_AI_META_SCHEMA_VER ||
  candidate.updateTime > candidate.metaTime;

export function computeContentAiStatus(
  mainDb: Database.Database,
  configured: boolean,
  running: boolean
): ContentAiStatus {
  const candidates = listCandidates(mainDb);
  let processed = 0;
  let estimatedTokens = 0;
  for (const candidate of candidates) {
    if (candidate.metaTime !== null) processed++;
    estimatedTokens +=
      Math.min(candidate.count, INPUT_MAX_CHARS) * TOKENS_PER_CHAR + TOKENS_OVERHEAD;
  }
  return { configured, running, total: candidates.length, processed, estimatedTokens };
}

function documentTitle(mainDb: Database.Database, kind: ContentAiKind, contentId: number): string {
  if (kind === "card") return "";
  const sql =
    kind === "article"
      ? `SELECT title FROM articles WHERE content_id = ? AND is_delete = 0 LIMIT 1`
      : `SELECT title FROM project_item WHERE content_id = ? AND project_item_type = 'document' LIMIT 1`;
  return (mainDb.prepare(sql).get(contentId) as { title: string | null } | undefined)?.title ?? "";
}

export class ContentAiQueue {
  private slot: LlmRef | null = null;
  private dbName: string | null = null;
  /** 切库、换槽、清空槽时自增；进行中的一轮发现代次变化即停止 */
  private generation = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private abort: AbortController | null = null;
  private pending = new Map<number, number>();
  private sweepTimer: NodeJS.Timeout | null = null;
  private notifyTimer: NodeJS.Timeout | null = null;
  private notifyDirty = false;
  private lastNotifyAt = 0;
  private running = false;

  constructor(private readonly deps: ContentAiDeps) {}

  getSlot(): LlmRef | null {
    return this.slot;
  }

  isRunning(): boolean {
    return this.running;
  }

  /** 设置变化：槽从无到有、换模型、清空都作废当前一轮；配上即对账 */
  applySetting(setting: SettingForLlmSlots) {
    const next = resolveUsageSlot(setting, CONTENT_AI_SLOT);
    const same = next?.providerId === this.slot?.providerId && next?.modelId === this.slot?.modelId;
    if (same) return;
    this.slot = next;
    this.invalidate();
    if (!next) {
      this.pending.clear();
      this.stopSweep();
      log.info("[ContentAiQueue] 功能槽已清空，停止处理");
      return;
    }
    log.info(`[ContentAiQueue] 功能槽 ${next.providerId}/${next.modelId}`);
    if (this.dbName) this.scheduleReconcile(this.dbName);
  }

  onDatabaseConnected(dbName: string) {
    this.dbName = dbName;
    this.invalidate();
    this.pending.clear();
    if (this.slot) this.scheduleReconcile(dbName);
  }

  onContentWritten(dbName: string, contentId: number, action: string) {
    if (!this.slot || action === "delete" || dbName !== this.dbName) return;
    this.pending.set(contentId, this.deps.now());
    this.ensureSweep();
  }

  /** 到期（静置满 IDLE_MS）的正文交给串行链判断；测试与定时器共用 */
  sweep() {
    const now = this.deps.now();
    const due: number[] = [];
    for (const [id, at] of this.pending) {
      if (now - at >= IDLE_MS) due.push(id);
    }
    for (const id of due) this.pending.delete(id);
    if (this.pending.size === 0) this.stopSweep();
    if (due.length && this.slot && this.dbName) {
      const dbName = this.dbName;
      const generation = this.generation;
      this.enqueue(() => this.runRound(dbName, generation, due));
    }
  }

  /** 等串行链空闲（测试用） */
  idle(): Promise<unknown> {
    return this.chain;
  }

  private invalidate() {
    this.generation++;
    this.abort?.abort();
    this.abort = null;
  }

  private scheduleReconcile(dbName: string) {
    const generation = this.generation;
    this.enqueue(() => this.runRound(dbName, generation));
  }

  private enqueue(task: () => Promise<void>) {
    this.chain = this.chain
      .then(task)
      .catch(error => log.error("[ContentAiQueue] 任务失败", error));
  }

  private ensureSweep() {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_MS);
    this.sweepTimer.unref?.();
  }

  private stopSweep() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  private isStale(generation: number, mainDb: Database.Database) {
    return generation !== this.generation || !mainDb.open;
  }

  /** ids 缺省为整库对账；给定时只判断这些正文 */
  private async runRound(dbName: string, generation: number, ids?: number[]) {
    const slot = this.slot;
    if (!slot || generation !== this.generation) return;
    const dbs = await this.deps.databases(dbName);
    if (!dbs || this.isStale(generation, dbs.mainDb)) return;
    const { mainDb, indexDb } = dbs;
    const startedAt = this.deps.now();
    if (!ids) {
      const removed = ContentAiMetaTable.removeOrphans(mainDb);
      if (removed) log.info(`[ContentAiQueue] 清理孤儿元信息 ${removed} 行`);
    }
    const tasks = listCandidates(mainDb, ids)
      .filter(needsWork)
      .sort((a, b) => b.updateTime - a.updateTime);
    if (!tasks.length) return;

    const abort = new AbortController();
    this.abort = abort;
    this.running = true;
    this.requestNotify(dbName);
    const counts: Record<Outcome, number> = { generated: 0, checked: 0, skipped: 0, failed: 0 };
    let consecutiveFailures = 0;
    let stopped = false;
    const failures = new Map<number, FailureRecord>();
    try {
      for (const task of tasks) {
        if (this.isStale(generation, mainDb)) {
          stopped = true;
          break;
        }
        const result = await this.processOne(mainDb, task, slot, generation, abort.signal);
        counts[result.outcome]++;
        if (result.outcome === "failed") {
          failures.set(task.id, { contentId: task.id, error: result.error, at: this.deps.now() });
          if (++consecutiveFailures >= ABORT_AFTER_CONSECUTIVE_FAILURES) {
            log.warn(
              `[ContentAiQueue] 连续 ${consecutiveFailures} 份失败，停止本轮：${result.error}`
            );
            stopped = true;
            break;
          }
        } else {
          consecutiveFailures = 0;
          if (result.outcome === "generated") this.requestNotify(dbName);
        }
        await yieldToEventLoop();
      }
    } finally {
      if (this.abort === abort) this.abort = null;
      this.running = false;
      this.requestNotify(dbName);
    }
    if (indexDb?.open && generation === this.generation) {
      this.recordFailures(
        indexDb,
        failures,
        tasks.map(task => task.id)
      );
    }
    log.info(
      `[ContentAiQueue] ${ids ? "增量" : "对账"} db=${dbName} tasks=${tasks.length} generated=${counts.generated} checked=${counts.checked} skipped=${counts.skipped} failed=${counts.failed} stopped=${stopped} elapsedMs=${this.deps.now() - startedAt}`
    );
  }

  private async processOne(
    mainDb: Database.Database,
    task: Candidate,
    slot: LlmRef,
    generation: number,
    signal: AbortSignal
  ): Promise<{ outcome: Exclude<Outcome, "failed"> } | { outcome: "failed"; error: string }> {
    const content = ContentTable.getContentById(mainDb, task.id);
    if (!content) return { outcome: "skipped" };
    const kind = KIND_BY_RANK[task.rank] ?? "card";
    const body = content.content as Descendant[];
    const userPrompt = buildContentAiUserPrompt({
      kind,
      title: documentTitle(mainDb, kind, task.id),
      content: body,
    });
    const digest = textDigest(contentPlainText(body));
    if (!userPrompt) {
      // 没有文字（只有图片等）：记一行空元信息，进度能走满；之后加了文字，指纹相似度为 0 会重算
      ContentAiMetaTable.upsert(
        mainDb,
        { contentId: task.id, textDigest: digest, meta: EMPTY_META, model: "" },
        this.deps.now()
      );
      return { outcome: "checked" };
    }
    const existing = ContentAiMetaTable.get(mainDb, task.id);
    if (
      existing &&
      existing.schemaVer >= CONTENT_AI_META_SCHEMA_VER &&
      digestSimilarity(existing.textDigest, digest) >= DIGEST_RECOMPUTE_THRESHOLD
    ) {
      ContentAiMetaTable.touch(mainDb, task.id, this.deps.now());
      return { outcome: "checked" };
    }

    let lastError = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (this.isStale(generation, mainDb)) return { outcome: "skipped" };
      const result = await this.deps.complete(
        {
          providerId: slot.providerId,
          modelId: slot.modelId,
          system: CONTENT_AI_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt }],
          thinking: "off",
          source: { feature: CONTENT_AI_SLOT, entityId: String(task.id) },
        },
        signal
      );
      if (this.isStale(generation, mainDb)) return { outcome: "skipped" };
      const meta = result.ok && !result.error ? parseContentAiOutput(result.text) : null;
      if (meta) {
        ContentAiMetaTable.upsert(
          mainDb,
          {
            contentId: task.id,
            textDigest: digest,
            meta,
            model: `${slot.providerId}/${slot.modelId}`,
          },
          this.deps.now()
        );
        return { outcome: "generated" };
      }
      lastError = result.error || (result.ok ? "输出无法解析" : "模型请求失败");
      log.warn(`[ContentAiQueue] content=${task.id} 第 ${attempt} 次失败：${lastError}`);
      if (attempt < MAX_ATTEMPTS) await this.deps.sleep(1000 * attempt);
    }
    return { outcome: "failed", error: lastError };
  }

  /** 失败记录：本轮处理过的先移除，再写入本轮失败的；只留最近的若干条 */
  private recordFailures(
    indexDb: Database.Database,
    failures: Map<number, FailureRecord>,
    handled: number[]
  ) {
    try {
      const row = indexDb
        .prepare(`SELECT value FROM index_meta WHERE key = ?`)
        .get(FAILURES_META_KEY) as { value: string } | undefined;
      let records: FailureRecord[] = [];
      try {
        records = row?.value ? (JSON.parse(row.value) as FailureRecord[]) : [];
      } catch {
        records = [];
      }
      const handledSet = new Set(handled);
      const next = [
        ...records.filter(record => !handledSet.has(record.contentId)),
        ...failures.values(),
      ].slice(-MAX_FAILURE_RECORDS);
      if (!next.length && !records.length) return;
      indexDb
        .prepare(
          `INSERT INTO index_meta (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        )
        .run(FAILURES_META_KEY, JSON.stringify(next), this.deps.now());
    } catch (error) {
      log.warn("[ContentAiQueue] 记录失败列表出错", error);
    }
  }

  /** 首轮可能每秒写一份：渲染端的失效节流到 NOTIFY_THROTTLE_MS 一次 */
  private requestNotify(dbName: string) {
    this.notifyDirty = true;
    if (this.notifyTimer) return;
    const wait = Math.max(0, this.lastNotifyAt + NOTIFY_THROTTLE_MS - this.deps.now());
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      if (!this.notifyDirty) return;
      this.notifyDirty = false;
      this.lastNotifyAt = this.deps.now();
      this.deps.notifyChanged(dbName);
    }, wait);
    this.notifyTimer.unref?.();
  }
}

class ContentAiQueueModule implements Module {
  name = "content-ai-queue";

  async init() {
    const queue = new ContentAiQueue({
      databases: async dbName => {
        const mainDb = databaseModule.getDatabase(dbName);
        if (!mainDb?.open) return null;
        await databaseModule.ensureIndexDatabaseReady(dbName, "content-ai");
        return { mainDb, indexDb: databaseModule.getIndexDatabase(dbName) ?? null };
      },
      complete: (request, signal) => PiAiRuntimeModule.complete(request, signal),
      notifyChanged: dbName => {
        if (databaseModule.getCurrentDatabaseName() === dbName) {
          databaseModule.notifyExternalWrite(CONTENT_AI_META_CHANGED_EVENT);
        }
        broadcastDatabaseChange(CONTENT_AI_META_CHANGED_EVENT, dbName);
      },
      sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
      now: () => Date.now(),
    });
    ipcMain.handle("content-ai:status", async (): Promise<ContentAiStatus | null> => {
      const mainDb = databaseModule.getCurrentDatabase();
      if (!mainDb?.open) return null;
      return computeContentAiStatus(mainDb, queue.getSlot() !== null, queue.isRunning());
    });
    userSettingModule.onSettingChanged(({ newSetting }) => queue.applySetting(newSetting));
    databaseModule.onDatabaseConnected(dbName => queue.onDatabaseConnected(dbName));
    onContentWritten(({ dbName, contentId, action }) =>
      queue.onContentWritten(dbName, contentId, action)
    );
    queue.applySetting(await userSettingModule.getSettingSnapshot());
    // 模块晚于首次连库初始化时补一次
    const current = databaseModule.getCurrentDatabase();
    if (current?.open) queue.onDatabaseConnected(databaseModule.getCurrentDatabaseName());
    log.info("[ContentAiQueue] Module initialized");
  }
}

export default new ContentAiQueueModule();
