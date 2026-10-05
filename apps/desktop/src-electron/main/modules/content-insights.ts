/**
 * AI 洞见（KL-058 / KL-059）：用户在卡片、文章、项目文档详情点「AI 洞见」时，对这一篇做一次分析。
 *
 * 1. 本地候选（不花 token，宽）：本文每个有文字的节用自己的向量查近邻，排除已有关系（同脉络「相关」，
 *    但不排除同项目——重复与矛盾常在同一项目里），高于随机块对 p95，按对方正文去重取前 CANDIDATE_LIMIT 个；
 * 2. 一次模型调用（槽 contentInsights）：本文 + 候选的要点与主张 + 所属主题 → 位置、标记、问题；
 * 3. 逐条核对原文片段与候选编号，存主库 content_ai_insights（继承已处理的状态）。
 *
 * 只在用户触发时运行，同一份正文同时只跑一次；不做后台与全库分析。
 */

import type Database from "better-sqlite3";
import { BrowserWindow, ipcMain } from "electron";
import log from "electron-log";
import type { Descendant } from "slate";
import { normalizeEntityRefKind, entityRefKey, type EntityRef } from "@/entity/ref";
import { splitSections } from "@/entity/sections";
import {
  DIGEST_RECOMPUTE_THRESHOLD,
  contentPlainText,
  digestSimilarity,
  textDigest,
} from "@/entity/text-digest";
import type {
  ContentInsights,
  ContentInsightsPhase,
  ContentInsightsResult,
  InsightMark,
  InsightStatus,
  InsightTarget,
} from "@/types/content-insights";
import type { PiSingleShotRequest } from "@/types/pi-llm";
import type { Module } from "../types/module";
import {
  CONTENT_INSIGHTS_SYSTEM_PROMPT,
  buildInsightsUserPrompt,
  parseInsightsOutput,
  promptSectionsOf,
  type InsightCandidate,
} from "./content-insights-prompt";
import databaseModule from "./database";
import { ensureRelatedThreshold, relatedExclusions } from "./entity-context/context-related";
import { resolveUsageSlot, type LlmRef, type SettingForLlmSlots } from "./llm-usage-slot";
import PiAiRuntimeModule from "./pi-ai-runtime";
import ContentAiInsightsTable from "./tables/content-ai-insights";
import ContentAiMetaTable from "./tables/content-ai-meta";
import ContentTable from "./tables/content";
import EntitySearchTable from "./tables/entity-search";
import userSettingModule from "./user-setting";

export const CONTENT_INSIGHTS_SLOT = "contentInsights";
export const CANDIDATE_LIMIT = 15;
const PARSE_ATTEMPTS = 2;
/** 每节查近邻的块数：长文多节，邻居也多节，多取再按实体去重 */
const KNN_CHUNKS = 200;
/** 去掉代码、图片、链接后不足这么多字的节不查近邻（参考链接、截图节、代码节是主要噪音） */
export const MIN_PROSE_CHARS = 80;
const LINKED_TITLES = 12;
const TYPES_SQL = "'card','article','project-item'";
const KIND_LABEL: Record<string, string> = {
  card: "卡片",
  article: "文章",
  "project-item": "项目文档",
};
const PICKER = { card: "card", article: "article", "project-item": "project_item" } as const;

/** 节文本（Markdown）里的「文字」：去掉代码块、行内代码、图片、链接网址与 HTML 标签 */
export function proseOf(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[#>*_\-|]/g, "")
    .replace(/\s+/g, "");
}

const hasTable = (db: Database.Database, name: string) =>
  !!db.prepare(`SELECT 1 FROM sqlite_master WHERE name = ?`).get(name);

interface SelfInfo {
  ref: EntityRef;
  key: string;
  contentId: number;
  title: string;
  content: Descendant[];
}

function selfOf(mainDb: Database.Database, ref: EntityRef): SelfInfo | null {
  const sql =
    ref.kind === "card"
      ? `SELECT content_id, '' AS title FROM cards WHERE id = ?`
      : ref.kind === "article"
        ? `SELECT content_id, title FROM articles WHERE id = ? AND is_delete = 0`
        : ref.kind === "project-item"
          ? `SELECT content_id, title FROM project_item WHERE id = ?`
          : null;
  if (!sql) return null;
  const row = mainDb.prepare(sql).get(ref.id) as
    { content_id: number | null; title: string | null } | undefined;
  if (!row?.content_id) return null;
  const content = ContentTable.getContentById(mainDb, row.content_id);
  if (!content) return null;
  return {
    ref,
    key: entityRefKey(ref),
    contentId: row.content_id,
    title: row.title ?? "",
    content: content.content as Descendant[],
  };
}

function contentIdOf(mainDb: Database.Database, ref: EntityRef): number | null {
  const sql =
    ref.kind === "card"
      ? `SELECT content_id AS id FROM cards WHERE id = ?`
      : ref.kind === "article"
        ? `SELECT content_id AS id FROM articles WHERE id = ? AND is_delete = 0`
        : ref.kind === "project-item"
          ? `SELECT content_id AS id FROM project_item WHERE id = ?`
          : null;
  if (!sql) return null;
  return (mainDb.prepare(sql).get(ref.id) as { id: number | null } | undefined)?.id ?? null;
}

const parseKey = (key: string): EntityRef | null => {
  const [kind, id] = key.split(":");
  const normalized = normalizeEntityRefKind(kind);
  const numeric = Number(id);
  return normalized && Number.isSafeInteger(numeric) ? { kind: normalized, id: numeric } : null;
};

export interface CandidateInfo {
  no: number;
  target: InsightTarget;
  similarity: number;
  prompt: InsightCandidate;
}

/** 本地候选（§1）：已有关系的数量与标题一并返回，写「位置」用 */
export function findCandidates(
  mainDb: Database.Database,
  indexDb: Database.Database,
  self: SelfInfo
): { candidates: CandidateInfo[]; linkedKeys: string[]; notes: number } {
  const identities = EntitySearchTable.locateAll(mainDb, [self.contentId]).get(self.contentId) ?? [
    self.ref,
  ];
  if (!identities.some(identity => entityRefKey(identity) === self.key)) identities.push(self.ref);
  const exclusions = relatedExclusions(mainDb, indexDb, identities, [self.contentId]);
  const identityKeys = new Set(identities.map(entityRefKey));
  const linkedKeys = [...exclusions.keys].filter(key => !identityKeys.has(key));
  if (!hasTable(indexDb, "vec_documents")) return { candidates: [], linkedKeys, notes: 0 };
  const notes = (
    indexDb
      .prepare(
        `SELECT COUNT(DISTINCT prefixed_id) AS n FROM vec_documents WHERE type IN (${TYPES_SQL})`
      )
      .get() as { n: number }
  ).n;
  const threshold = ensureRelatedThreshold(indexDb);
  if (!threshold) return { candidates: [], linkedKeys, notes };

  const sectionText = indexDb.prepare(
    `SELECT heading_path, block_start, text FROM content_sections
     WHERE prefixed_id = ? AND update_time = ? AND chunk_index = ?`
  );
  const own = indexDb
    .prepare(
      `SELECT chunk_index, update_time, vec_embedding FROM vec_documents WHERE prefixed_id = ? ORDER BY chunk_index`
    )
    .all(self.key) as Array<{ chunk_index: number; update_time: number; vec_embedding: Buffer }>;
  const knn = indexDb.prepare(
    `SELECT prefixed_id, chunk_index, update_time, distance FROM vec_documents
     WHERE vec_embedding MATCH ? AND k = ? AND type IN (${TYPES_SQL})`
  );
  const proseCache = new Map<string, number>();
  const proseLength = (key: string, updateTime: number, chunk: number) => {
    const id = `${key}#${updateTime}#${chunk}`;
    if (!proseCache.has(id)) {
      const row = sectionText.get(key, Math.round(updateTime), chunk) as
        { text: string } | undefined;
      // 没有节信息（卡片等整篇一节的旧索引）时不按文字量过滤
      proseCache.set(id, row ? proseOf(row.text).length : MIN_PROSE_CHARS);
    }
    return proseCache.get(id)!;
  };

  const best = new Map<
    number,
    { key: string; chunk: number; updateTime: number; similarity: number }
  >();
  for (const chunk of own) {
    if (proseLength(self.key, chunk.update_time, chunk.chunk_index) < MIN_PROSE_CHARS) continue;
    const rows = knn.all(chunk.vec_embedding, KNN_CHUNKS) as Array<{
      prefixed_id: string;
      chunk_index: number;
      update_time: number;
      distance: number;
    }>;
    for (const row of rows) {
      const similarity = 1 - row.distance;
      if (similarity <= threshold.value) break;
      if (identityKeys.has(row.prefixed_id) || exclusions.keys.has(row.prefixed_id)) continue;
      const ref = parseKey(row.prefixed_id);
      const contentId = ref ? contentIdOf(mainDb, ref) : null;
      if (contentId == null || contentId === self.contentId || exclusions.contents.has(contentId)) {
        continue;
      }
      if (proseLength(row.prefixed_id, row.update_time, row.chunk_index) < MIN_PROSE_CHARS)
        continue;
      const previous = best.get(contentId);
      if (previous && previous.similarity >= similarity) continue;
      best.set(contentId, {
        key: row.prefixed_id,
        chunk: row.chunk_index,
        updateTime: row.update_time,
        similarity,
      });
    }
  }

  const picked = [...best.entries()]
    .sort((a, b) => b[1].similarity - a[1].similarity)
    .slice(0, CANDIDATE_LIMIT);
  const metas = ContentAiMetaTable.getMany(
    mainDb,
    picked.map(([contentId]) => contentId)
  );
  const candidates: CandidateInfo[] = [];
  for (const [contentId, hit] of picked) {
    const ref = parseKey(hit.key)!;
    const resolved = EntitySearchTable.resolve(
      mainDb,
      PICKER[ref.kind as keyof typeof PICKER],
      ref.id,
      0
    );
    if (!resolved) continue;
    const section = sectionText.get(hit.key, Math.round(hit.updateTime), hit.chunk) as
      { heading_path: string; block_start: number; text: string } | undefined;
    const meta = metas.get(contentId)?.meta;
    const excerpt = (section?.text ?? resolved.excerpt).replace(/\s+/g, " ").trim();
    const no = candidates.length + 1;
    const target: InsightTarget = {
      ref,
      contentId,
      title: resolved.title,
      heading: section?.heading_path ?? "",
      block: section?.block_start ?? 0,
      excerpt: excerpt.slice(0, 160),
    };
    candidates.push({
      no,
      target,
      similarity: hit.similarity,
      prompt: {
        no,
        kindLabel: KIND_LABEL[ref.kind] ?? "笔记",
        title: resolved.title,
        heading: target.heading,
        summary: meta?.summary ?? "",
        claims: meta?.claims ?? [],
        excerpt,
      },
    });
  }
  return { candidates, linkedKeys, notes };
}

/** 本文所属的知识地图主题：「父主题 › 主题」 */
function topicOf(indexDb: Database.Database, key: string): string {
  if (!hasTable(indexDb, "knowledge_map_nodes")) return "";
  const row = indexDb
    .prepare(
      `SELECT t.label AS topic, s.label AS subtopic FROM knowledge_map_nodes n
       LEFT JOIN knowledge_map_topics t ON t.id = n.topic
       LEFT JOIN knowledge_map_topics s ON s.id = n.subtopic
       WHERE n.node_key = ?`
    )
    .get(key) as { topic: string | null; subtopic: string | null } | undefined;
  return [row?.topic, row?.subtopic].filter(Boolean).join(" › ");
}

export interface AnalyzeDeps {
  complete(
    request: Omit<PiSingleShotRequest, "requestId">,
    signal?: AbortSignal
  ): Promise<{ ok: boolean; text: string; error?: string }>;
  now(): number;
}

/** 分析一篇并保存；正文为空、没有可分析的文字时抛错（界面提示） */
export async function analyzeContent(
  deps: AnalyzeDeps,
  mainDb: Database.Database,
  indexDb: Database.Database,
  ref: EntityRef,
  slot: LlmRef,
  onPhase: (phase: ContentInsightsPhase) => void = () => undefined,
  signal?: AbortSignal
): Promise<ContentInsights> {
  const self = selfOf(mainDb, ref);
  if (!self) throw new Error("内容不存在");
  const plain = contentPlainText(self.content);
  if (!plain.trim()) throw new Error("正文还没有文字");
  const { candidates, linkedKeys, notes } = findCandidates(mainDb, indexDb, self);
  onPhase({ contentId: self.contentId, phase: "candidates", candidates: candidates.length, notes });

  const sections = promptSectionsOf(
    self.content,
    splitSections(self.content, self.title, ref.kind === "card")
  ).filter(section => section.text.trim());
  const linkedTitles = linkedKeys
    .slice(0, LINKED_TITLES)
    .map(key => {
      const target = parseKey(key);
      if (!target || !(target.kind in PICKER)) return "";
      return (
        EntitySearchTable.resolve(mainDb, PICKER[target.kind as keyof typeof PICKER], target.id, 0)
          ?.title ?? ""
      );
    })
    .filter(Boolean);
  const { prompt, sections: used } = buildInsightsUserPrompt({
    kindLabel: KIND_LABEL[ref.kind] ?? "笔记",
    title: self.title,
    topic: topicOf(indexDb, self.key),
    linkedCount: linkedKeys.length,
    linkedTitles,
    sections,
    candidates: candidates.map(candidate => candidate.prompt),
  });
  onPhase({ contentId: self.contentId, phase: "thinking" });
  const byNo = new Map(candidates.map(candidate => [candidate.no, candidate]));
  // 偶尔输出不是合法 JSON（逗号写成分号等）：同样的请求再试一次，仍不行才报错
  let parsed: ReturnType<typeof parseInsightsOutput> = null;
  for (let attempt = 0; attempt < PARSE_ATTEMPTS && !parsed; attempt++) {
    const response = await deps.complete(
      {
        providerId: slot.providerId,
        modelId: slot.modelId,
        system: CONTENT_INSIGHTS_SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
        thinking: "off",
        source: { feature: CONTENT_INSIGHTS_SLOT, entityId: String(self.contentId) },
      },
      signal
    );
    if (!response.ok || response.error) throw new Error(response.error || "模型请求失败");
    parsed = parseInsightsOutput(response.text, self.content, used, new Set(byNo.keys()));
  }
  if (!parsed) throw new Error("模型输出无法解析，请重新分析");

  const marks: InsightMark[] = parsed.marks.map((mark, index) => {
    const { candidate, ...rest } = mark;
    const target = candidate != null ? byNo.get(candidate)?.target : undefined;
    return { ...rest, id: `m${index + 1}`, ...(target ? { target } : {}), status: "open" as const };
  });
  const result: ContentInsightsResult = {
    lead: parsed.lead,
    marks,
    asks: parsed.asks.map((text, index) => ({
      id: `q${index + 1}`,
      text,
      status: "open" as const,
    })),
    candidates: candidates.length,
  };
  const row = ContentAiInsightsTable.save(
    mainDb,
    {
      contentId: self.contentId,
      textDigest: textDigest(plain),
      result,
      model: `${slot.providerId}/${slot.modelId}`,
    },
    deps.now()
  );
  return {
    contentId: row.contentId,
    result: row.result,
    model: row.model,
    analyzedAt: row.updateTime,
    stale: false,
  };
}

/** 已有结果；正文在分析之后大改时 stale = true */
export function readInsights(mainDb: Database.Database, ref: EntityRef): ContentInsights | null {
  const self = selfOf(mainDb, ref);
  if (!self) return null;
  const row = ContentAiInsightsTable.get(mainDb, self.contentId);
  if (!row) return null;
  const similarity = digestSimilarity(row.textDigest, textDigest(contentPlainText(self.content)));
  return {
    contentId: row.contentId,
    result: row.result,
    model: row.model,
    analyzedAt: row.updateTime,
    stale: similarity < DIGEST_RECOMPUTE_THRESHOLD,
  };
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

class ContentInsightsModule implements Module {
  name = "content-insights";
  private slot: LlmRef | null = null;
  private running = new Map<
    number,
    { controller: AbortController; task: Promise<ContentInsights> }
  >();

  async init() {
    const applySetting = (setting: SettingForLlmSlots) => {
      this.slot = resolveUsageSlot(setting, CONTENT_INSIGHTS_SLOT);
    };
    applySetting(await userSettingModule.getSettingSnapshot());
    userSettingModule.onSettingChanged(({ newSetting }) => applySetting(newSetting));
    databaseModule.onDatabaseConnected(dbName => {
      const mainDb = databaseModule.getDatabase(dbName);
      if (!mainDb?.open) return;
      const removed = ContentAiInsightsTable.removeOrphans(mainDb);
      if (removed) log.info(`[ContentInsights] 清理孤儿洞见 ${removed} 行`);
    });

    ipcMain.handle("content-insights:get", async (event, raw: unknown) => {
      const { mainDb } = await this.databases(event.sender);
      return readInsights(mainDb, this.parseRef(raw));
    });
    ipcMain.handle("content-insights:analyze", async (event, raw: unknown) => {
      const ref = this.parseRef(raw);
      if (!this.slot) throw new Error("还没有为「AI 洞见」配置模型");
      const { mainDb, indexDb } = await this.databases(event.sender);
      const contentId = contentIdOf(mainDb, ref);
      if (contentId == null) throw new Error("内容不存在");
      const existing = this.running.get(contentId);
      if (existing) return existing.task;
      const controller = new AbortController();
      const sender = event.sender;
      const slot = this.slot;
      const startedAt = Date.now();
      const task = analyzeContent(
        {
          complete: (request, signal) => PiAiRuntimeModule.complete(request, signal),
          now: Date.now,
        },
        mainDb,
        indexDb,
        ref,
        slot,
        phase => {
          if (!sender.isDestroyed()) sender.send("content-insights:phase", phase);
        },
        controller.signal
      )
        .then(result => {
          log.info(
            `[ContentInsights] ${entityRefKey(ref)} candidates=${result.result.candidates} marks=${result.result.marks.length} elapsedMs=${Date.now() - startedAt}`
          );
          return result;
        })
        .catch(error => {
          log.warn(`[ContentInsights] ${entityRefKey(ref)} 失败：${errorMessage(error)}`);
          throw error;
        })
        .finally(() => this.running.delete(contentId));
      this.running.set(contentId, { controller, task });
      return task;
    });
    ipcMain.handle("content-insights:cancel", async (event, raw: unknown) => {
      const { mainDb } = await this.databases(event.sender);
      const contentId = contentIdOf(mainDb, this.parseRef(raw));
      if (contentId != null) this.running.get(contentId)?.controller.abort();
      return true;
    });
    ipcMain.handle(
      "content-insights:set-status",
      async (event, input: { contentId: number; itemId: string; status: InsightStatus }) => {
        const { mainDb } = await this.databases(event.sender);
        return ContentAiInsightsTable.setStatus(
          mainDb,
          Number(input?.contentId),
          String(input?.itemId),
          input?.status
        );
      }
    );
    log.info("[ContentInsights] Module initialized");
  }

  private parseRef(raw: unknown): EntityRef {
    const input = raw as Partial<EntityRef> | null;
    const kind = normalizeEntityRefKind(input?.kind);
    const id = Number(input?.id);
    if (!kind || !Number.isSafeInteger(id) || id <= 0) throw new Error("实体地址无效");
    return { kind, id };
  }

  private async databases(sender: Electron.WebContents) {
    const win = BrowserWindow.fromWebContents(sender);
    const dbName = win ? databaseModule.windowToDatabase.get(win.id) : undefined;
    if (!dbName) throw new Error("No database name found");
    const mainDb = databaseModule.getDatabase(dbName);
    if (!mainDb?.open) throw new Error("数据库未就绪");
    await databaseModule.ensureIndexDatabaseReady(dbName, "content-insights");
    const indexDb = databaseModule.getIndexDatabase(dbName);
    if (!indexDb) throw new Error("索引库未就绪");
    return { mainDb, indexDb };
  }
}

export default new ContentInsightsModule();
