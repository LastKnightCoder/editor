/**
 * 主题与全局层 AI 洞见的本地候选（不花 token，宽：宁多勿漏，判断交给模型，ai-insights §5.1）。
 *
 * 阈值都相对当前库「随机块对 p95」（ensureRelatedThreshold，按嵌入指纹存 index_meta）取，
 * 换嵌入模型时跟着变，不写死相似度。
 */

import type Database from "better-sqlite3";
import { CHAT_PROMPT_TYPE, parseChatPromptKey } from "./chat-prompt-index";
import { meanVector } from "./tables/knowledge-map";

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
  const recent = (
    indexDb
      .prepare(`SELECT prefixed_id, update_time FROM vec_documents WHERE type = ?`)
      .all(CHAT_PROMPT_TYPE) as Array<{ prefixed_id: string; update_time: number }>
  )
    .sort((a, b) => b.update_time - a.update_time)
    .slice(0, options.recent ?? ASKED_RECENT_LIMIT);
  const own = indexDb.prepare(
    `SELECT content, vec_embedding FROM vec_documents WHERE prefixed_id = ? AND chunk_index = 0`
  );
  const knn = indexDb.prepare(
    `SELECT prefixed_id, distance FROM vec_documents
     WHERE vec_embedding MATCH ? AND k = 3 AND type IN (${NOTE_TYPES_SQL})`
  );
  const unwritten: Array<AskedPromptHit & { vector: Float32Array }> = [];
  for (let i = 0; i < recent.length; i++) {
    const row = recent[i];
    const key = parseChatPromptKey(row.prefixed_id);
    const vector = own.get(row.prefixed_id) as
      { content: string; vec_embedding: Buffer } | undefined;
    if (!key || !vector) continue;
    const near = knn.all(vector.vec_embedding) as Array<{ prefixed_id: string; distance: number }>;
    const nearest = near.length ? 1 - near[0].distance : 0;
    if (nearest < threshold + ASKED_NEAR_MARGIN) {
      unwritten.push({
        ...key,
        text: vector.content,
        time: row.update_time,
        nearest,
        nearestKey: near[0]?.prefixed_id ?? "",
        vector: new Float32Array(toFloats(vector.vec_embedding)),
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

/** 一组节向量的 L2 归一化均值（笔记的整体向量），没有向量返回 null */
export function noteVector(indexDb: Database.Database, key: string): Float32Array | null {
  const rows = indexDb
    .prepare(`SELECT vec_embedding FROM vec_documents WHERE prefixed_id = ?`)
    .all(key) as Array<{ vec_embedding: Buffer }>;
  const mean = meanVector(rows.map(row => row.vec_embedding));
  return mean ? new Float32Array(toFloats(mean)) : null;
}
