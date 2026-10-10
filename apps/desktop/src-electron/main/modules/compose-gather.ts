/**
 * 创作模式（KL-070 / 18 §4）：按写作意图召集资料、写作时比对当前段落与白板上的资料。
 *
 * 召集 = 本地宽候选 + 一次模型调用（槽 contentInsights）：
 * 1. 意图（再找一些时加上正文最近写的内容）嵌入后查节级近邻，按正文去重，再用 7a 概念补召回；
 *    排除本文的所有身份、已关联的（显式连接与正文里的引用，进入时已单独摆上白板）、白板上已有的与用户移走过的；
 * 2. 模型挑 8–12 份、分 3–4 组、每份一句为什么相关；核对候选编号后返回，由渲染端摆上白板。
 * 段落比对只用本地向量、不调模型：段落嵌入一次，与白板上每份资料的节向量取最大余弦。
 *
 * 只在用户触发时运行，同一份正文同时只召集一次。
 */

import type Database from "better-sqlite3";
import { BrowserWindow, ipcMain } from "electron";
import log from "electron-log";
import type { Descendant } from "slate";
import { entityRefKey, normalizeEntityRefKind, type EntityRef } from "@/entity/ref";
import { extractInlineRefs } from "@/entity/inline-refs";
import { contentPlainText } from "@/entity/text-digest";
import type { GatherGroup, GatherInput, GatherPhase, GatherResult } from "@/types/compose";
import type { PiSingleShotRequest } from "@/types/pi-llm";
import type { Module } from "../types/module";
import { resolveEmbeddingConfig } from "../utils/embedding-config";
import {
  COMPOSE_GATHER_SYSTEM_PROMPT,
  buildGatherUserPrompt,
  parseGatherOutput,
  type GatherCandidate,
} from "./compose-gather-prompt";
import { CONTENT_INSIGHTS_SLOT } from "./content-insights";
import databaseModule from "./database";
import { ensureRelatedThreshold } from "./entity-context/context-related";
import { resolveUsageSlot, type LlmRef, type SettingForLlmSlots } from "./llm-usage-slot";
import PiAiRuntimeModule from "./pi-ai-runtime";
import ComposeBoardTable from "./tables/compose-board";
import ContentAiMetaTable from "./tables/content-ai-meta";
import ContentLinkTable from "./tables/content-link";
import ContentTable from "./tables/content";
import EntitySearchTable from "./tables/entity-search";
import VecDocumentTable from "./tables/vec-document";
import userSettingModule from "./user-setting";

/** 本地候选给模型的份数 */
export const GATHER_CANDIDATES = 60;
/** 向量召回的块数：长文多节，多取再按正文去重 */
const KNN_CHUNKS = 150;
/** 概念补召回的上限：只补向量没召回的 */
const CONCEPT_EXTRA = 20;
const RECENT_CHARS = 1500;
const PARSE_ATTEMPTS = 2;
const TYPES = ["card", "article", "project-item", "diary-moment"] as const;
const KIND_LABEL: Record<string, string> = {
  card: "卡片",
  article: "文章",
  "project-item": "项目文档",
  "diary-moment": "日记",
};
const PICKER = {
  card: "card",
  article: "article",
  "project-item": "project_item",
  "diary-moment": "diary-moment",
} as const;

const hasTable = (db: Database.Database, name: string) =>
  !!db.prepare(`SELECT 1 FROM sqlite_master WHERE name = ?`).get(name);

const parseKey = (key: string): EntityRef | null => {
  const [kind, id] = key.split(":");
  const normalized = normalizeEntityRefKind(kind);
  const numeric = Number(id);
  return normalized && Number.isSafeInteger(numeric) ? { kind: normalized, id: numeric } : null;
};

const toVector = (blob: Buffer) =>
  new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / Float32Array.BYTES_PER_ELEMENT);

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

interface Candidate {
  no: number;
  ref: EntityRef;
  contentId: number;
  title: string;
  heading: string;
  block: number;
  prompt: GatherCandidate;
}

interface SelfDoc {
  contentId: number;
  identityKeys: Set<string>;
  title: string;
  content: Descendant[];
}

function selfOf(mainDb: Database.Database, contentId: number): SelfDoc {
  const content = ContentTable.getContentById(mainDb, contentId);
  if (!content) throw new Error("正文不存在");
  const identities = EntitySearchTable.locateAll(mainDb, [contentId]).get(contentId) ?? [];
  // 按实体优先级取代表身份的标题：文章 > 项目文档
  const article = identities.find(ref => ref.kind === "article");
  const projectItem = identities.find(ref => ref.kind === "project-item");
  const titleRow = (table: string, id: number) =>
    mainDb.prepare(`SELECT title FROM ${table} WHERE id = ?`).get(id) as
      { title: string } | undefined;
  const title = article
    ? (titleRow("articles", article.id)?.title ?? "")
    : projectItem
      ? (titleRow("project_item", projectItem.id)?.title ?? "")
      : "";
  return {
    contentId,
    identityKeys: new Set(identities.map(entityRefKey)),
    title,
    content: content.content as Descendant[],
  };
}

/** 本文已关联的实体：显式连接（按对方正文的全部身份）与正文里的引用 */
export function linkedKeysOf(mainDb: Database.Database, self: SelfDoc): Set<string> {
  const keys = new Set<string>();
  const neighbors = [
    ...new Set([...ContentLinkTable.edgesOf(mainDb, [self.contentId]).values()].flat()),
  ];
  for (const refs of EntitySearchTable.locateAll(mainDb, neighbors).values()) {
    for (const ref of refs) keys.add(entityRefKey(ref));
  }
  for (const { dst } of extractInlineRefs(self.content)) keys.add(entityRefKey(dst));
  return keys;
}

/** 正文里的标题（大纲）与最近写的一段文字 */
function outlineOf(content: Descendant[]): string[] {
  return content
    .filter(
      (node): node is Descendant & { type: string } => (node as { type?: string }).type === "header"
    )
    .map(node => contentPlainText([node]).trim())
    .filter(Boolean);
}

/** 本地候选（§4.1 第 1 步） */
export function findGatherCandidates(
  mainDb: Database.Database,
  indexDb: Database.Database,
  input: {
    self: SelfDoc;
    query: ArrayLike<number> | null;
    intent: string;
    exclude: Set<string>;
    kinds: Set<string>;
  }
): { candidates: Candidate[]; notes: number } {
  if (!hasTable(indexDb, "vec_documents")) return { candidates: [], notes: 0 };
  const allowed = TYPES.filter(type => !input.kinds.size || input.kinds.has(type));
  if (!allowed.length) return { candidates: [], notes: 0 };
  const typesSql = allowed.map(type => `'${type}'`).join(",");
  const notes = (
    indexDb
      .prepare(
        `SELECT COUNT(DISTINCT prefixed_id) AS n FROM vec_documents WHERE type IN (${typesSql})`
      )
      .get() as { n: number }
  ).n;

  const skip = (key: string) => input.self.identityKeys.has(key) || input.exclude.has(key);
  const best = new Map<
    number,
    { key: string; chunk: number; updateTime: number; similarity: number }
  >();
  const keep = (
    key: string,
    hit: { chunk: number; updateTime: number; similarity: number }
  ): boolean => {
    if (skip(key)) return false;
    const ref = parseKey(key);
    if (!ref) return false;
    const contentId = contentIdOf(mainDb, ref);
    if (contentId == null || contentId === input.self.contentId) return false;
    const previous = best.get(contentId);
    if (previous && previous.similarity >= hit.similarity) return true;
    best.set(contentId, { key, ...hit });
    return true;
  };

  if (input.query) {
    const rows = indexDb
      .prepare(
        `SELECT prefixed_id, chunk_index, update_time, distance FROM vec_documents
         WHERE vec_embedding MATCH ? AND k = ? AND type IN (${typesSql})`
      )
      .all(new Float32Array(Array.from(input.query)), KNN_CHUNKS) as Array<{
      prefixed_id: string;
      chunk_index: number;
      update_time: number;
      distance: number;
    }>;
    for (const row of rows) {
      keep(row.prefixed_id, {
        chunk: row.chunk_index,
        updateTime: row.update_time,
        similarity: 1 - row.distance,
      });
    }
  }
  const ranked = [...best.entries()].sort((a, b) => b[1].similarity - a[1].similarity);
  const picked = ranked.slice(0, GATHER_CANDIDATES - Math.min(CONCEPT_EXTRA, ranked.length / 3));

  // 意图里直接提到的概念：补上向量没召回的笔记
  const pickedIds = new Set(picked.map(([contentId]) => contentId));
  const extra = conceptMatches(mainDb, input.intent, pickedIds, input.self.contentId);
  for (const contentId of extra) {
    if (picked.length >= GATHER_CANDIDATES) break;
    const ref = EntitySearchTable.locateAll(mainDb, [contentId])
      .get(contentId)
      ?.find(item => allowed.includes(item.kind as (typeof TYPES)[number]));
    if (!ref || skip(entityRefKey(ref))) continue;
    picked.push([contentId, { key: entityRefKey(ref), chunk: 0, updateTime: 0, similarity: 0 }]);
  }

  const sectionText = indexDb.prepare(
    `SELECT heading_path, block_start, text FROM content_sections
     WHERE prefixed_id = ? AND update_time = ? AND chunk_index = ?`
  );
  const metas = ContentAiMetaTable.getMany(
    mainDb,
    picked.map(([contentId]) => contentId)
  );
  const candidates: Candidate[] = [];
  for (const [contentId, hit] of picked) {
    const ref = parseKey(hit.key)!;
    const resolved = EntitySearchTable.resolve(mainDb, PICKER[ref.kind], ref.id, 0);
    if (!resolved) continue;
    const section = hit.updateTime
      ? (sectionText.get(hit.key, Math.round(hit.updateTime), hit.chunk) as
          { heading_path: string; block_start: number; text: string } | undefined)
      : undefined;
    const meta = metas.get(contentId)?.meta;
    const no = candidates.length + 1;
    candidates.push({
      no,
      ref,
      contentId,
      title: resolved.title,
      heading: section?.heading_path ?? "",
      block: section?.block_start ?? 0,
      prompt: {
        no,
        kindLabel: KIND_LABEL[ref.kind] ?? "笔记",
        title: resolved.title,
        heading: section?.heading_path ?? "",
        summary: meta?.summary ?? "",
        claims: meta?.claims ?? [],
        excerpt: (section?.text ?? resolved.excerpt).replace(/\s+/g, " ").trim(),
      },
    });
  }
  return { candidates, notes };
}

/** 正文 id；文章在回收站里的不算 */
function contentIdOf(mainDb: Database.Database, ref: EntityRef): number | null {
  const sql =
    ref.kind === "card"
      ? `SELECT content_id AS id FROM cards WHERE id = ?`
      : ref.kind === "article"
        ? `SELECT content_id AS id FROM articles WHERE id = ? AND is_delete = 0`
        : ref.kind === "project-item"
          ? `SELECT content_id AS id FROM project_item WHERE id = ?`
          : `SELECT content_id AS id FROM diary_segments WHERE id = ?`;
  return (mainDb.prepare(sql).get(ref.id) as { id: number | null } | undefined)?.id ?? null;
}

/** 7a 概念被意图原文提到的正文（≥ 2 字的概念才算） */
function conceptMatches(
  mainDb: Database.Database,
  intent: string,
  exclude: Set<number>,
  selfContentId: number
): number[] {
  const text = intent.toLowerCase();
  if (!text.trim() || !hasTable(mainDb, "content_ai_meta")) return [];
  const rows = mainDb.prepare(`SELECT content_id, meta FROM content_ai_meta`).all() as Array<{
    content_id: number;
    meta: string;
  }>;
  const hits: Array<{ contentId: number; score: number }> = [];
  for (const row of rows) {
    if (row.content_id === selfContentId || exclude.has(row.content_id)) continue;
    let concepts: unknown;
    try {
      concepts = (JSON.parse(row.meta) as { concepts?: unknown }).concepts;
    } catch {
      continue;
    }
    if (!Array.isArray(concepts)) continue;
    let score = 0;
    for (const concept of concepts) {
      if (typeof concept !== "string" || concept.trim().length < 2) continue;
      if (text.includes(concept.trim().toLowerCase())) score += concept.trim().length;
    }
    if (score) hits.push({ contentId: row.content_id, score });
  }
  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, CONCEPT_EXTRA)
    .map(hit => hit.contentId);
}

export interface GatherDeps {
  embed(texts: string[]): Promise<number[][]>;
  complete(
    request: Omit<PiSingleShotRequest, "requestId">,
    signal?: AbortSignal
  ): Promise<{ ok: boolean; text: string; error?: string }>;
}

/** 召集一次；没有可用的候选时返回空组（界面提示「没有找到」） */
export async function gather(
  deps: GatherDeps,
  mainDb: Database.Database,
  indexDb: Database.Database,
  input: GatherInput,
  slot: LlmRef,
  onPhase: (phase: GatherPhase) => void = () => undefined,
  signal?: AbortSignal
): Promise<GatherResult> {
  const self = selfOf(mainDb, input.contentId);
  const board = ComposeBoardTable.get(mainDb, input.contentId);
  const intent = input.intent.trim();
  const plain = contentPlainText(self.content);
  const recent = input.more ? plain.slice(-RECENT_CHARS) : "";
  const queryText = [intent, recent || (intent ? "" : plain.slice(0, RECENT_CHARS))]
    .filter(Boolean)
    .join("\n");
  if (!queryText.trim()) throw new Error("先说说想写什么");

  let query: number[] | null = null;
  try {
    query = (await deps.embed([queryText]))[0] ?? null;
  } catch (error) {
    // 嵌入失败时只靠概念补召回，不让整次召集失败
    log.warn(`[ComposeGather] 嵌入失败：${error instanceof Error ? error.message : error}`);
  }
  if (signal?.aborted) throw new Error("已取消");
  const { candidates, notes } = findGatherCandidates(mainDb, indexDb, {
    self,
    query,
    intent: queryText,
    exclude: new Set([
      ...input.exclude,
      ...(board?.dismissed ?? []),
      ...linkedKeysOf(mainDb, self),
    ]),
    kinds: new Set(input.kinds ?? []),
  });
  onPhase({
    contentId: input.contentId,
    phase: "candidates",
    candidates: candidates.length,
    notes,
  });
  if (!candidates.length) return { groups: [], candidates: 0 };

  onPhase({ contentId: input.contentId, phase: "thinking" });
  const prompt = buildGatherUserPrompt({
    intent,
    title: self.title,
    outline: outlineOf(self.content),
    recent,
    candidates: candidates.map(candidate => candidate.prompt),
  });
  const byNo = new Map(candidates.map(candidate => [candidate.no, candidate]));
  let parsed: ReturnType<typeof parseGatherOutput> = null;
  for (let attempt = 0; attempt < PARSE_ATTEMPTS && !parsed; attempt++) {
    const response = await deps.complete(
      {
        providerId: slot.providerId,
        modelId: slot.modelId,
        system: COMPOSE_GATHER_SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
        thinking: "off",
        source: { feature: CONTENT_INSIGHTS_SLOT, entityId: String(input.contentId) },
      },
      signal
    );
    if (!response.ok || response.error) throw new Error(response.error || "模型请求失败");
    parsed = parseGatherOutput(response.text, new Set(byNo.keys()));
  }
  if (!parsed) throw new Error("模型输出无法解析，请重试");

  const groups: GatherGroup[] = parsed.groups.map(group => ({
    name: group.name,
    items: group.items.map(item => {
      const candidate = byNo.get(item.candidate)!;
      return {
        ref: candidate.ref,
        contentId: candidate.contentId,
        title: candidate.title,
        why: item.why,
        heading: candidate.heading,
        block: candidate.block,
      };
    }),
  }));
  return { groups, candidates: candidates.length };
}

/** 段落与白板上各份资料的最大余弦（§4.2）；阈值沿用脉络「相关」的随机块对分位 */
export function paragraphSimilarity(
  indexDb: Database.Database,
  query: ArrayLike<number>,
  keys: string[]
): { scores: Array<{ key: string; similarity: number }>; threshold: number | null } {
  if (!hasTable(indexDb, "vec_documents")) return { scores: [], threshold: null };
  const vectors = indexDb.prepare(`SELECT vec_embedding FROM vec_documents WHERE prefixed_id = ?`);
  const scores = keys.map(key => {
    let similarity = 0;
    for (const row of vectors.all(key) as Array<{ vec_embedding: Buffer }>) {
      similarity = Math.max(similarity, cosine(query, toVector(row.vec_embedding)));
    }
    return { key, similarity };
  });
  return { scores, threshold: ensureRelatedThreshold(indexDb)?.value ?? null };
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

class ComposeGatherModule implements Module {
  name = "compose-gather";
  private slot: LlmRef | null = null;
  private running = new Map<number, { controller: AbortController; task: Promise<GatherResult> }>();

  async init() {
    const applySetting = (setting: SettingForLlmSlots) => {
      this.slot = resolveUsageSlot(setting, CONTENT_INSIGHTS_SLOT);
    };
    applySetting(await userSettingModule.getSettingSnapshot());
    userSettingModule.onSettingChanged(({ newSetting }) => applySetting(newSetting));
    databaseModule.onDatabaseConnected(dbName => {
      const mainDb = databaseModule.getDatabase(dbName);
      if (!mainDb?.open) return;
      const removed = ComposeBoardTable.removeOrphans(mainDb);
      if (removed) log.info(`[ComposeGather] 清理孤儿素材板 ${removed} 块`);
    });

    ipcMain.handle("compose:gather", async (event, raw: unknown) => {
      const input = this.parseInput(raw);
      if (!this.slot) throw new Error("还没有为「AI 洞见」配置模型");
      const existing = this.running.get(input.contentId);
      if (existing) return existing.task;
      const { mainDb, indexDb } = await this.databases(event.sender);
      const controller = new AbortController();
      const sender = event.sender;
      const startedAt = Date.now();
      const task = gather(
        {
          embed: texts => this.embed(texts),
          complete: (request, signal) => PiAiRuntimeModule.complete(request, signal),
        },
        mainDb,
        indexDb,
        input,
        this.slot,
        phase => {
          if (!sender.isDestroyed()) sender.send("compose:gather-phase", phase);
        },
        controller.signal
      )
        .then(result => {
          log.info(
            `[ComposeGather] content=${input.contentId} candidates=${result.candidates} picked=${result.groups.reduce((sum, group) => sum + group.items.length, 0)} elapsedMs=${Date.now() - startedAt}`
          );
          return result;
        })
        .catch(error => {
          log.warn(`[ComposeGather] content=${input.contentId} 失败：${errorMessage(error)}`);
          throw error;
        })
        .finally(() => this.running.delete(input.contentId));
      this.running.set(input.contentId, { controller, task });
      return task;
    });
    ipcMain.handle("compose:cancel", async (_event, contentId: unknown) => {
      this.running.get(Number(contentId))?.controller.abort();
      return true;
    });
    ipcMain.handle(
      "compose:paragraph-similarity",
      async (event, input: { text?: unknown; keys?: unknown }) => {
        const text = typeof input?.text === "string" ? input.text.trim() : "";
        const keys = Array.isArray(input?.keys)
          ? input.keys.filter((key): key is string => typeof key === "string")
          : [];
        if (!text || !keys.length) return { scores: [], threshold: null };
        const { indexDb } = await this.databases(event.sender);
        const [query] = await this.embed([text]);
        if (!query) return { scores: [], threshold: null };
        return paragraphSimilarity(indexDb, query, keys);
      }
    );
    log.info("[ComposeGather] Module initialized");
  }

  private async embed(texts: string[]): Promise<number[][]> {
    const config = resolveEmbeddingConfig(await userSettingModule.getSettingSnapshot());
    if (!config) throw new Error("还没有配置嵌入模型");
    return VecDocumentTable.embedQueries(texts, config);
  }

  private parseInput(raw: unknown): GatherInput {
    const input = raw as Partial<GatherInput> | null;
    const contentId = Number(input?.contentId);
    if (!Number.isSafeInteger(contentId) || contentId <= 0) throw new Error("正文 id 无效");
    const strings = (value: unknown) =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    return {
      contentId,
      intent: typeof input?.intent === "string" ? input.intent : "",
      exclude: strings(input?.exclude),
      kinds: strings(input?.kinds),
      more: Boolean(input?.more),
    };
  }

  private async databases(sender: Electron.WebContents) {
    const win = BrowserWindow.fromWebContents(sender);
    const dbName = win ? databaseModule.windowToDatabase.get(win.id) : undefined;
    if (!dbName) throw new Error("No database name found");
    const mainDb = databaseModule.getDatabase(dbName);
    if (!mainDb?.open) throw new Error("数据库未就绪");
    await databaseModule.ensureIndexDatabaseReady(dbName, "compose-gather");
    const indexDb = databaseModule.getIndexDatabase(dbName);
    if (!indexDb) throw new Error("索引库未就绪");
    return { mainDb, indexDb };
  }
}

export default new ComposeGatherModule();
