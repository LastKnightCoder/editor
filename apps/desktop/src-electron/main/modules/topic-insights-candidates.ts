/**
 * 主题与全局层 AI 洞见的本地候选（不花 token，宽：宁多勿漏，判断交给模型，ai-insights §5.1）。
 *
 * 阈值都相对当前库「随机块对 p95」（ensureRelatedThreshold，按嵌入指纹存 index_meta）取，
 * 换嵌入模型时跟着变，不写死相似度。
 */

import type Database from "better-sqlite3";
import type { KnowledgeMap } from "@/knowledge-map/types";
import { CHAT_PROMPT_TYPE, parseChatPromptKey } from "./chat-prompt-index";
import type { ContentAiMetaRow } from "./tables/content-ai-meta";
import type { MemberSnapshot } from "./tables/knowledge-ai-insights";
import { meanVector, type MapEntity } from "./tables/knowledge-map";

/** 参与洞见的笔记向量类型：我的思考（与知识地图一致） */
export const NOTE_TYPES_SQL = "'card','article','project-item'";

/** 问了但没写：只看最近这么多条提问（方向信号看近期；重度库也只查这么多次近邻） */
export const ASKED_RECENT_LIMIT = 2000;
export const ASKED_GROUP_LIMIT = 15;
const ASKED_PROMPTS_PER_GROUP = 5;
/** 提问离最近一份笔记的相似度低于「p95 + 这个量」才算「没写」 */
export const ASKED_NEAR_MARGIN = 0.05;
/** 两条提问的相似度高于「p95 + 这个量」算问的是同一件事 */
export const ASKED_GROUP_MARGIN = 0.1;

const yieldToEventLoop = () => new Promise<void>(resolve => setImmediate(resolve));

export const toFloats = (blob: Buffer) =>
  new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);

export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export interface AskedPromptHit {
  sessionId: string;
  messageId: string;
  text: string;
  time: number;
  /** 离最近一份笔记的相似度 */
  nearest: number;
  /** 最近那份笔记的节点键（定位「最接近的主题」） */
  nearestKey: string;
}

export interface AskedGroup {
  /** 最近的在前，最多 ASKED_PROMPTS_PER_GROUP 条 */
  prompts: AskedPromptHit[];
  /** 组里一共问过几次 */
  times: number;
  last: number;
}

/**
 * 问了但没写：最近的提问里，离所有笔记都不近的，按彼此相近成组；按次数与最近程度排序。
 * 一次性的事务性提问（翻译、查命令）也会混进来，由模型剔除。
 */
export async function askedCandidates(
  indexDb: Database.Database,
  threshold: number,
  options: { limit?: number; recent?: number } = {}
): Promise<AskedGroup[]> {
  const hasVectors = indexDb
    .prepare(`SELECT 1 FROM sqlite_master WHERE name = 'vec_documents'`)
    .get();
  if (!hasVectors) return [];
  // 一次扫出全部提问（vec0 按 prefixed_id 逐条取会每次扫全表）
  const recent = (
    indexDb
      .prepare(
        `SELECT prefixed_id, update_time, content, vec_embedding FROM vec_documents
         WHERE type = ? AND chunk_index = 0`
      )
      .all(CHAT_PROMPT_TYPE) as Array<{
      prefixed_id: string;
      update_time: number;
      content: string;
      vec_embedding: Buffer;
    }>
  )
    .sort((a, b) => b.update_time - a.update_time)
    .slice(0, options.recent ?? ASKED_RECENT_LIMIT);
  const knn = indexDb.prepare(
    `SELECT prefixed_id, distance FROM vec_documents
     WHERE vec_embedding MATCH ? AND k = 3 AND type IN (${NOTE_TYPES_SQL})`
  );
  const unwritten: Array<AskedPromptHit & { vector: Float32Array }> = [];
  for (let i = 0; i < recent.length; i++) {
    const row = recent[i];
    const key = parseChatPromptKey(row.prefixed_id);
    if (!key) continue;
    const near = knn.all(row.vec_embedding) as Array<{ prefixed_id: string; distance: number }>;
    const nearest = near.length ? 1 - near[0].distance : 0;
    if (nearest < threshold + ASKED_NEAR_MARGIN) {
      unwritten.push({
        ...key,
        text: row.content,
        time: row.update_time,
        nearest,
        nearestKey: near[0]?.prefixed_id ?? "",
        vector: new Float32Array(toFloats(row.vec_embedding)),
      });
    }
    if (i % 50 === 49) await yieldToEventLoop();
  }

  // 贪心成组：按时间从新到旧，和某组的第一条足够近就并进去
  const groups: Array<{ seed: Float32Array; members: AskedPromptHit[] }> = [];
  for (const hit of unwritten) {
    const { vector, ...prompt } = hit;
    const group = groups.find(item => cosine(item.seed, vector) >= threshold + ASKED_GROUP_MARGIN);
    if (group) group.members.push(prompt);
    else groups.push({ seed: vector, members: [prompt] });
  }
  const now = Math.max(0, ...unwritten.map(hit => hit.time));
  const score = (members: AskedPromptHit[]) => {
    // 问得越多越靠前；同样次数时越近越靠前（半年衰减一半）
    const age = (now - members[0].time) / (180 * 24 * 3600_000);
    return members.length + 0.5 ** Math.max(0, age);
  };
  return groups
    .sort((a, b) => score(b.members) - score(a.members))
    .slice(0, options.limit ?? ASKED_GROUP_LIMIT)
    .map(group => ({
      prompts: group.members.slice(0, ASKED_PROMPTS_PER_GROUP),
      times: group.members.length,
      last: group.members[0].time,
    }));
}

// ───────────────────────── 地图分组与成员快照 ─────────────────────────

/** 子主题（或没有细分的主题本身）里的一组笔记 */
export interface MapGroup {
  /** 「主题 id:子主题 id」，主题内没细分的成员子主题 id 为 -1 */
  key: string;
  topicId: number;
  subtopicId: number;
  label: string;
  members: MapEntity[];
}

export interface MapTopicGroups {
  topicId: number;
  label: string;
  members: MapEntity[];
  groups: MapGroup[];
}

/** 当前地图的主题与子主题分组；未归类（topic = -1）的节点不参与 */
export function mapGroups(map: KnowledgeMap, entities: MapEntity[]): MapTopicGroups[] {
  const byKey = new Map(entities.map(entity => [entity.key, entity]));
  const labels = new Map(map.topics.map(topic => [topic.id, topic.label]));
  const topics = new Map<number, MapTopicGroups>();
  for (const topic of map.topics.filter(item => item.parent === -1)) {
    topics.set(topic.id, { topicId: topic.id, label: topic.label, members: [], groups: [] });
  }
  const groups = new Map<string, MapGroup>();
  for (const node of map.nodes) {
    const entity = byKey.get(node.key);
    const topic = topics.get(node.topic);
    if (!entity || !topic) continue;
    topic.members.push(entity);
    const key = `${node.topic}:${node.subtopic}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        topicId: node.topic,
        subtopicId: node.subtopic,
        label: node.subtopic >= 0 ? (labels.get(node.subtopic) ?? topic.label) : topic.label,
        members: [],
      };
      groups.set(key, group);
      topic.groups.push(group);
    }
    group.members.push(entity);
  }
  for (const topic of topics.values()) {
    // 主题有细分时，没归进任何子主题的那些叫「其他」
    const hasSubtopics = topic.groups.some(group => group.subtopicId >= 0);
    for (const group of topic.groups) {
      if (group.subtopicId < 0 && hasSubtopics) group.label = "其他";
      group.members.sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
    }
    topic.groups.sort((a, b) => b.members.length - a.members.length);
  }
  return [...topics.values()].filter(topic => topic.members.length > 0);
}

/** FNV-1a 32 位：元信息内容的短指纹（只用于判断「重新生成过」） */
export function shortHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** 成员快照 [[contentId, 元信息指纹]]，按正文去重排序；没有元信息的指纹为空串 */
export function memberSnapshot(
  members: MapEntity[],
  metas: Map<number, ContentAiMetaRow>
): MemberSnapshot {
  const ids = [...new Set(members.map(member => member.contentId).filter(id => id > 0))].sort(
    (a, b) => a - b
  );
  return ids.map(id => {
    const meta = metas.get(id);
    return [id, meta ? shortHash(JSON.stringify(meta.meta)) : ""];
  });
}

const QUARTER_MS = 91.31 * 24 * 3600_000;

/** 最近 quarters 个季度每季新写的笔记数（最早在前），带「2025Q3」标签 */
export function growthSeries(
  createdAts: number[],
  now: number,
  quarters = 12
): Array<{ quarter: string; count: number }> {
  const date = new Date(now);
  const current = date.getFullYear() * 4 + Math.floor(date.getMonth() / 3);
  const counts = new Array(quarters).fill(0);
  for (const time of createdAts) {
    if (!time) continue;
    const at = new Date(time);
    const index = quarters - 1 - (current - (at.getFullYear() * 4 + Math.floor(at.getMonth() / 3)));
    if (index >= 0 && index < quarters) counts[index]++;
  }
  return counts.map((count, index) => {
    const quarter = current - (quarters - 1 - index);
    return { quarter: `${Math.floor(quarter / 4)}Q${(quarter % 4) + 1}`, count };
  });
}

/** 最近一年新写了多少（主题列表给模型看「在长还是停了」） */
export const recentCount = (createdAts: number[], now: number) =>
  createdAts.filter(time => time && now - time <= 4 * QUARTER_MS).length;

// ───────────────────────── 相近的笔记对 ─────────────────────────

export interface NoteVectors {
  key: string;
  mean: Float32Array;
  chunks: Array<{ chunk: number; updateTime: number; vector: Float32Array }>;
}

/** vec0 按 prefixed_id 过滤不走索引、每条语句都扫全表：一批 key 合进一条 IN 查询 */
const VECTOR_BATCH = 400;

/** 一批笔记的节向量与均值；没有向量的不在结果里 */
export function loadNoteVectors(
  indexDb: Database.Database,
  keys: string[]
): Map<string, NoteVectors> {
  const rowsByKey = new Map<
    string,
    Array<{ chunk_index: number; update_time: number; vec_embedding: Buffer }>
  >();
  const unique = [...new Set(keys)];
  for (let start = 0; start < unique.length; start += VECTOR_BATCH) {
    const batch = unique.slice(start, start + VECTOR_BATCH);
    const rows = indexDb
      .prepare(
        `SELECT prefixed_id, chunk_index, update_time, vec_embedding FROM vec_documents
         WHERE prefixed_id IN (${batch.map(() => "?").join(",")})`
      )
      .all(...batch) as Array<{
      prefixed_id: string;
      chunk_index: number;
      update_time: number;
      vec_embedding: Buffer;
    }>;
    for (const row of rows) {
      const list = rowsByKey.get(row.prefixed_id);
      if (list) list.push(row);
      else rowsByKey.set(row.prefixed_id, [row]);
    }
  }
  const result = new Map<string, NoteVectors>();
  for (const [key, rows] of rowsByKey) {
    const mean = meanVector(rows.map(row => row.vec_embedding));
    if (!mean) continue;
    result.set(key, {
      key,
      mean: new Float32Array(toFloats(mean)),
      chunks: rows.map(row => ({
        chunk: Number(row.chunk_index),
        updateTime: row.update_time,
        vector: new Float32Array(toFloats(row.vec_embedding)),
      })),
    });
  }
  return result;
}

export interface NotePair {
  left: string;
  right: string;
  similarity: number;
}

/** 每份笔记最多出现在几对里：免得一份「什么都沾边」的笔记占满名额 */
const PAIRS_PER_NOTE = 3;

/**
 * 一组笔记内语义相近、还没连接的对（重复 / 矛盾的候选）：两两比较整体向量，高于阈值的按相似度取前 limit 对。
 * involving 给定时只要至少一端在其中的对（增量改写只看变了的成员）。
 */
export function pairCandidates(
  vectors: NoteVectors[],
  linked: (a: string, b: string) => boolean,
  threshold: number,
  limit: number,
  involving?: ReadonlySet<string>
): NotePair[] {
  const pairs: NotePair[] = [];
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      const a = vectors[i];
      const b = vectors[j];
      if (involving && !involving.has(a.key) && !involving.has(b.key)) continue;
      const similarity = cosine(a.mean, b.mean);
      if (similarity <= threshold || linked(a.key, b.key)) continue;
      pairs.push({ left: a.key, right: b.key, similarity });
    }
  }
  pairs.sort((a, b) => b.similarity - a.similarity);
  const used = new Map<string, number>();
  const picked: NotePair[] = [];
  for (const pair of pairs) {
    if ((used.get(pair.left) ?? 0) >= PAIRS_PER_NOTE) continue;
    if ((used.get(pair.right) ?? 0) >= PAIRS_PER_NOTE) continue;
    used.set(pair.left, (used.get(pair.left) ?? 0) + 1);
    used.set(pair.right, (used.get(pair.right) ?? 0) + 1);
    picked.push(pair);
    if (picked.length >= limit) break;
  }
  return picked;
}

/** 长文里和对方最接近的那一节（给模型摘原文片段、给「去连接」定位） */
export function bestSection(
  indexDb: Database.Database,
  note: NoteVectors,
  other: Float32Array
): { heading: string; blockStart: number; text: string } | null {
  let best: NoteVectors["chunks"][number] | null = null;
  let score = -Infinity;
  for (const chunk of note.chunks) {
    const value = cosine(chunk.vector, other);
    if (value > score) {
      score = value;
      best = chunk;
    }
  }
  if (!best) return null;
  const row = indexDb
    .prepare(
      `SELECT heading_path, block_start, text FROM content_sections
       WHERE prefixed_id = ? AND update_time = ? AND chunk_index = ?`
    )
    .get(note.key, Math.round(best.updateTime), best.chunk) as
    { heading_path: string; block_start: number; text: string } | undefined;
  return row ? { heading: row.heading_path, blockStart: row.block_start, text: row.text } : null;
}

// ───────────────────────── 跨主题的呼应候选 ─────────────────────────

/** 两份笔记的概念重合度高于这个值，多半是同一份内容的两次记录（被分进了不同主题），算重复不算呼应 */
export const BRIDGE_MAX_CONCEPT_OVERLAP = 0.4;

/** 概念规整：去空白与大小写，「warnings 模块」与「warnings模块」算同一个 */
const normalizeConcept = (concept: string) => concept.replace(/\s+/g, "").toLowerCase();

/** 两组概念的 Jaccard 重合度；任一边没有概念时为 0（不据此排除） */
export function conceptOverlap(a: string[], b: string[]): number {
  const left = new Set(a.map(normalizeConcept).filter(Boolean));
  const right = new Set(b.map(normalizeConcept).filter(Boolean));
  if (!left.size || !right.size) return 0;
  let both = 0;
  for (const concept of left) if (right.has(concept)) both++;
  return both / (left.size + right.size - both);
}

/** 每个主题取几份代表去查近邻（重度库也只是「主题数 × 这个数」次查询） */
export const BRIDGE_REPRESENTATIVES = 30;
export const BRIDGE_LIMIT = 30;
const BRIDGES_PER_TOPIC_PAIR = 3;
const BRIDGES_PER_TOPIC = 6;
const BRIDGE_KNN_CHUNKS = 40;

/**
 * 跨主题、没有连接、相似度高于阈值的笔记对。每个主题挑链接多、最近写的几份作代表查近邻；
 * 同一对主题最多几对、同一主题最多出现几次，免得相邻的两个大主题占满名额（「看似无关」的才有意思）。
 */
export async function bridgeCandidates(
  indexDb: Database.Database,
  topics: MapTopicGroups[],
  linked: (a: string, b: string) => boolean,
  linkCount: (key: string) => number,
  threshold: number,
  conceptsOf: (key: string) => string[] = () => []
): Promise<NotePair[]> {
  const topicOf = new Map<string, number>();
  for (const topic of topics) {
    for (const member of topic.members) topicOf.set(member.key, topic.topicId);
  }
  const knn = indexDb.prepare(
    `SELECT prefixed_id, distance FROM vec_documents
     WHERE vec_embedding MATCH ? AND k = ? AND type IN (${NOTE_TYPES_SQL})`
  );
  const best = new Map<string, NotePair>();
  const repsByTopic = topics.map(topic => ({
    topic,
    reps: [...topic.members]
      .sort((a, b) => linkCount(b.key) - linkCount(a.key) || b.updateTime - a.updateTime)
      .slice(0, BRIDGE_REPRESENTATIVES),
  }));
  const repVectors = loadNoteVectors(
    indexDb,
    repsByTopic.flatMap(item => item.reps.map(rep => rep.key))
  );
  for (const { topic, reps } of repsByTopic) {
    for (const rep of reps) {
      const vector = repVectors.get(rep.key)?.mean;
      if (!vector) continue;
      const rows = knn.all(Buffer.from(vector.buffer), BRIDGE_KNN_CHUNKS) as Array<{
        prefixed_id: string;
        distance: number;
      }>;
      for (const row of rows) {
        const similarity = 1 - row.distance;
        if (similarity <= threshold) break;
        const other = topicOf.get(row.prefixed_id);
        if (other === undefined || other === topic.topicId) continue;
        if (linked(rep.key, row.prefixed_id)) continue;
        if (
          conceptOverlap(conceptsOf(rep.key), conceptsOf(row.prefixed_id)) >
          BRIDGE_MAX_CONCEPT_OVERLAP
        )
          continue;
        const [left, right] = [rep.key, row.prefixed_id].sort();
        const id = `${left}\u0000${right}`;
        if ((best.get(id)?.similarity ?? -Infinity) >= similarity) continue;
        best.set(id, { left, right, similarity });
      }
      await yieldToEventLoop();
    }
  }
  const perPair = new Map<string, number>();
  const perTopic = new Map<number, number>();
  const picked: NotePair[] = [];
  for (const pair of [...best.values()].sort((a, b) => b.similarity - a.similarity)) {
    const a = topicOf.get(pair.left) ?? -1;
    const b = topicOf.get(pair.right) ?? -1;
    const topicPair = a < b ? `${a}:${b}` : `${b}:${a}`;
    if ((perPair.get(topicPair) ?? 0) >= BRIDGES_PER_TOPIC_PAIR) continue;
    if ((perTopic.get(a) ?? 0) >= BRIDGES_PER_TOPIC) continue;
    if ((perTopic.get(b) ?? 0) >= BRIDGES_PER_TOPIC) continue;
    perPair.set(topicPair, (perPair.get(topicPair) ?? 0) + 1);
    perTopic.set(a, (perTopic.get(a) ?? 0) + 1);
    perTopic.set(b, (perTopic.get(b) ?? 0) + 1);
    picked.push(pair);
    if (picked.length >= BRIDGE_LIMIT) break;
  }
  return picked;
}
