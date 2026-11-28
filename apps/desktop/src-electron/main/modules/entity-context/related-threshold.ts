import type Database from "better-sqlite3";
import { cosine, toFloats } from "../../utils/embedding-vector";

export const THRESHOLD_META_KEY = "related_similarity_threshold";
const SAMPLE_PAIRS = 1000;
const THRESHOLD_PERCENTILE = 0.95;
/** 样本太少时阈值不可信，不给「相关」 */
const MIN_SAMPLE_PAIRS = 100;
/** 向量数比上次抽样时翻倍（或减半）就重新抽样 */
const RESAMPLE_RATIO = 2;
/** 参与「相关」的向量类型（与知识地图一致：我的思考） */
export const RELATED_TYPES = ["card", "article", "project-item"] as const;
const TYPE_SQL = RELATED_TYPES.map(type => `'${type}'`).join(",");

const hasTable = (db: Database.Database, name: string) =>
  !!db.prepare(`SELECT 1 FROM sqlite_master WHERE name = ?`).get(name);

export interface RelatedThreshold {
  fingerprint: string;
  value: number;
  /** 抽样时的向量数 */
  vectors: number;
  pairs: number;
  sampledAt: number;
}

/** 确定性随机数：同一库多次抽样结果稳定，便于对照 */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 抽样随机对：随机取向量块两两配对（不同实体），取相似度的 p95 */
export function sampleRelatedThreshold(
  indexDb: Database.Database,
  fingerprint: string,
  now = Date.now(),
  check: () => void = () => undefined
): RelatedThreshold | null {
  if (!hasTable(indexDb, "vec_documents")) return null;
  const rows = indexDb
    .prepare(`SELECT rowid, prefixed_id FROM vec_documents WHERE type IN (${TYPE_SQL})`)
    .all() as Array<{ rowid: number; prefixed_id: string }>;
  const entities = new Set(rows.map(row => row.prefixed_id));
  if (entities.size < 2) return null;
  const random = rng(rows.length);
  const vectorOf = indexDb.prepare(`SELECT vec_embedding FROM vec_documents WHERE rowid = ?`);
  const similarities: number[] = [];
  for (
    let attempt = 0;
    attempt < SAMPLE_PAIRS * 3 && similarities.length < SAMPLE_PAIRS;
    attempt++
  ) {
    check();
    const a = rows[Math.floor(random() * rows.length)];
    const b = rows[Math.floor(random() * rows.length)];
    if (a.prefixed_id === b.prefixed_id) continue;
    const va = vectorOf.get(a.rowid) as { vec_embedding: Buffer } | undefined;
    const vb = vectorOf.get(b.rowid) as { vec_embedding: Buffer } | undefined;
    if (!va || !vb) continue;
    similarities.push(cosine(toFloats(va.vec_embedding), toFloats(vb.vec_embedding)));
  }
  if (similarities.length < MIN_SAMPLE_PAIRS) return null;
  similarities.sort((x, y) => x - y);
  const value =
    similarities[
      Math.min(similarities.length - 1, Math.floor(similarities.length * THRESHOLD_PERCENTILE))
    ];
  return { fingerprint, value, vectors: rows.length, pairs: similarities.length, sampledAt: now };
}

export function readThreshold(indexDb: Database.Database): RelatedThreshold | null {
  const row = indexDb
    .prepare(`SELECT value FROM index_meta WHERE key = ?`)
    .get(THRESHOLD_META_KEY) as { value: string } | undefined;
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as RelatedThreshold;
  } catch {
    return null;
  }
}

export function vectorCount(indexDb: Database.Database): number {
  if (!hasTable(indexDb, "vec_documents")) return 0;
  return (
    indexDb
      .prepare(`SELECT COUNT(*) AS n FROM vec_documents WHERE type IN (${TYPE_SQL})`)
      .get() as { n: number }
  ).n;
}

export function readEmbeddingFingerprint(indexDb: Database.Database): string {
  const row = indexDb
    .prepare("SELECT value FROM vec_index_meta WHERE key = ?")
    .get("main_content_embedding_fingerprint") as { value: string } | undefined;
  return row?.value ?? "";
}

export function thresholdIsCurrent(stored: RelatedThreshold, fingerprint: string, count: number) {
  return (
    stored.fingerprint === fingerprint &&
    count <= stored.vectors * RESAMPLE_RATIO &&
    count * RESAMPLE_RATIO >= stored.vectors
  );
}

export function resolveRelatedThreshold(
  indexDb: Database.Database,
  now = Date.now(),
  check: () => void = () => undefined
) {
  if (!hasTable(indexDb, "vec_documents")) return { threshold: null, sampled: false };
  const fingerprint = readEmbeddingFingerprint(indexDb);
  const stored = readThreshold(indexDb);
  const count = vectorCount(indexDb);
  if (stored && thresholdIsCurrent(stored, fingerprint, count))
    return { threshold: stored, sampled: false };
  return { threshold: sampleRelatedThreshold(indexDb, fingerprint, now, check), sampled: true };
}

export function storeRelatedThreshold(indexDb: Database.Database, next: RelatedThreshold) {
  indexDb
    .prepare(`INSERT INTO index_meta (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .run(THRESHOLD_META_KEY, JSON.stringify(next), next.sampledAt);
}

export function ensureRelatedThreshold(indexDb: Database.Database): RelatedThreshold | null {
  const { threshold, sampled } = resolveRelatedThreshold(indexDb);
  if (threshold && sampled) storeRelatedThreshold(indexDb, threshold);
  return threshold;
}
