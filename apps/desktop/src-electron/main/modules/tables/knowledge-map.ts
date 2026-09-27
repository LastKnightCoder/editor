/**
 * 知识地图表：读取计算输入、读写离线结果。
 *
 * 计算本身（向量近邻 + 主题划分 + 布局，700 张卡约 1 秒）不在这里做——
 * 见 knowledge-map-builder，它在 worker 线程里跑，本表只负责 IO。
 * 读输入必须在主线程：better-sqlite3 连接不能跨线程共享。
 */

import type Database from "better-sqlite3";
import type {
  KnowledgeMap,
  KnowledgeMapCardInput,
  KnowledgeMapNode,
  KnowledgeMapTopic,
} from "@/knowledge-map/types";

/** 地图基于哪个 embedding 指纹算的；指纹变了（换模型）就整体重算 */
export const KNOWLEDGE_MAP_FINGERPRINT_KEY = "knowledge_map_fingerprint";
export const KNOWLEDGE_MAP_COMPUTED_AT_KEY = "knowledge_map_computed_at";
const MAIN_CONTENT_FINGERPRINT_KEY = "main_content_embedding_fingerprint";

export interface KnowledgeMapInputs {
  cards: KnowledgeMapCardInput[];
  /** 卡片 id → 分块向量（Float32 的原始字节，跨线程可转移） */
  chunks: Array<[number, ArrayBuffer[]]>;
}

/** 从正文里抽内联卡片链接（与渲染进程 utils/card.getInlineLinks 同义） */
function inlineLinks(content: unknown): number[] {
  const found: number[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const element = node as {
      type?: string;
      contentType?: string;
      refId?: number;
      children?: unknown[];
    };
    if (
      element.type === "content-link" &&
      element.contentType === "card" &&
      typeof element.refId === "number"
    ) {
      found.push(element.refId);
      return;
    }
    if (Array.isArray(element.children)) element.children.forEach(walk);
  };
  if (Array.isArray(content)) content.forEach(walk);
  return found;
}

const parseJson = <T>(raw: unknown, fallback: T): T => {
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

function hasTable(db: Database.Database, name: string) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE name = ?").get(name);
}

export default class KnowledgeMapTable {
  static readInputs(mainDb: Database.Database, indexDb: Database.Database): KnowledgeMapInputs {
    const rows = mainDb
      .prepare(
        `SELECT c.id, c.tags, c.links, ct.content
         FROM cards c LEFT JOIN contents ct ON c.content_id = ct.id`
      )
      .all() as Array<{
      id: number;
      tags: string | null;
      links: string | null;
      content: string | null;
    }>;

    const cards: KnowledgeMapCardInput[] = rows.map(row => ({
      id: row.id,
      tags: parseJson<string[]>(row.tags, []).filter(tag => typeof tag === "string"),
      links: [
        ...new Set([
          ...parseJson<number[]>(row.links, []),
          ...inlineLinks(parseJson<unknown>(row.content, [])),
        ]),
      ].filter(id => typeof id === "number"),
    }));

    const chunks = new Map<number, ArrayBuffer[]>();
    // 没配 embedding（或还没建过向量索引）时 vec_documents 不存在，地图退化为只靠显式链接
    if (hasTable(indexDb, "vec_documents")) {
      const statement = indexDb.prepare(
        "SELECT prefixed_id, vec_embedding FROM vec_documents WHERE type = 'card'"
      );
      for (const row of statement.iterate() as Iterable<{
        prefixed_id: string;
        vec_embedding: Buffer;
      }>) {
        const id = Number(row.prefixed_id.split(":")[1]);
        if (!Number.isFinite(id)) continue;
        // 拷出独立的 ArrayBuffer：better-sqlite3 返回的 Buffer 可能共享底层内存池
        const bytes = row.vec_embedding.buffer.slice(
          row.vec_embedding.byteOffset,
          row.vec_embedding.byteOffset + row.vec_embedding.byteLength
        ) as ArrayBuffer;
        const list = chunks.get(id);
        if (list) list.push(bytes);
        else chunks.set(id, [bytes]);
      }
    }
    return { cards, chunks: [...chunks] };
  }

  static readFingerprint(indexDb: Database.Database): string {
    const row = indexDb
      .prepare("SELECT value FROM vec_index_meta WHERE key = ?")
      .get(MAIN_CONTENT_FINGERPRINT_KEY) as { value: string } | undefined;
    return row?.value ?? "";
  }

  private static getMeta(indexDb: Database.Database, key: string): string | null {
    const row = indexDb.prepare("SELECT value FROM index_meta WHERE key = ?").get(key) as
      { value: string } | undefined;
    return row?.value ?? null;
  }

  private static setMeta(indexDb: Database.Database, key: string, value: string) {
    indexDb
      .prepare(
        `INSERT INTO index_meta (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run(key, value, Date.now());
  }

  static storedFingerprint(indexDb: Database.Database): string | null {
    return this.getMeta(indexDb, KNOWLEDGE_MAP_FINGERPRINT_KEY);
  }

  /** 整体替换：一个事务里清表再写，读的一方永远看不到半张地图 */
  static save(indexDb: Database.Database, map: KnowledgeMap, fingerprint: string) {
    const insertNode = indexDb.prepare(
      `INSERT INTO knowledge_map_nodes (card_id, x, y, topic, subtopic, update_time)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const insertTopic = indexDb.prepare(
      `INSERT INTO knowledge_map_topics (id, parent, label, color_slot, size) VALUES (?, ?, ?, ?, ?)`
    );
    indexDb.transaction(() => {
      indexDb.exec("DELETE FROM knowledge_map_nodes; DELETE FROM knowledge_map_topics;");
      for (const node of map.nodes) {
        insertNode.run(node.cardId, node.x, node.y, node.topic, node.subtopic, map.computedAt);
      }
      for (const topic of map.topics) {
        insertTopic.run(topic.id, topic.parent, topic.label, topic.colorSlot, topic.size);
      }
      this.setMeta(indexDb, KNOWLEDGE_MAP_FINGERPRINT_KEY, fingerprint);
      this.setMeta(indexDb, KNOWLEDGE_MAP_COMPUTED_AT_KEY, String(map.computedAt));
    })();
  }

  static load(indexDb: Database.Database): KnowledgeMap | null {
    if (!hasTable(indexDb, "knowledge_map_nodes")) return null;
    const computedAt = Number(this.getMeta(indexDb, KNOWLEDGE_MAP_COMPUTED_AT_KEY) ?? 0);
    if (!computedAt) return null;
    const nodes = (
      indexDb
        .prepare("SELECT card_id, x, y, topic, subtopic FROM knowledge_map_nodes")
        .all() as Array<{
        card_id: number;
        x: number;
        y: number;
        topic: number;
        subtopic: number;
      }>
    ).map<KnowledgeMapNode>(row => ({
      cardId: row.card_id,
      x: row.x,
      y: row.y,
      topic: row.topic,
      subtopic: row.subtopic,
    }));
    const topics = (
      indexDb
        .prepare("SELECT id, parent, label, color_slot, size FROM knowledge_map_topics ORDER BY id")
        .all() as Array<{
        id: number;
        parent: number;
        label: string;
        color_slot: number;
        size: number;
      }>
    ).map<KnowledgeMapTopic>(row => ({
      id: row.id,
      parent: row.parent,
      label: row.label,
      colorSlot: row.color_slot,
      size: row.size,
    }));
    return { nodes, topics, computedAt };
  }

  static cardIds(mainDb: Database.Database): number[] {
    return (mainDb.prepare("SELECT id FROM cards").all() as Array<{ id: number }>).map(
      row => row.id
    );
  }

  static hasVectors(indexDb: Database.Database, cardId: number): boolean {
    if (!hasTable(indexDb, "vec_documents")) return false;
    return !!indexDb
      .prepare("SELECT 1 FROM vec_documents WHERE prefixed_id = ? LIMIT 1")
      .get(`card:${cardId}`);
  }

  /**
   * 自上次整体重算以来「变过」的卡片数：增量放置的 ∪ 编辑过的（正文、tag、链接）。
   *
   * 编辑不做即时重新落位：改个错别字就让卡片在地图上挪位置，用户看着会觉得地图在乱跳；
   * 而且编辑刚保存时向量多半还没重算，这时按旧向量落位等于没挪。编辑的效果（主题名、
   * 归属、位置）留给整体重算，这里只把它计入漂移，编辑够多了自然触发重算。
   * 两边按卡片 id 去重：新建的卡既被放置过、update_time 也晚于重算时间，只算一次。
   */
  static driftCount(
    mainDb: Database.Database,
    indexDb: Database.Database,
    computedAt: number
  ): number {
    const changed = new Set(
      (
        indexDb
          .prepare("SELECT card_id FROM knowledge_map_nodes WHERE update_time > ?")
          .all(computedAt) as Array<{ card_id: number }>
      ).map(row => row.card_id)
    );
    for (const row of mainDb
      .prepare("SELECT id FROM cards WHERE update_time > ?")
      .all(computedAt) as Array<{ id: number }>) {
      changed.add(row.id);
    }
    return changed.size;
  }

  static upsertNode(indexDb: Database.Database, node: KnowledgeMapNode) {
    indexDb
      .prepare(
        `INSERT INTO knowledge_map_nodes (card_id, x, y, topic, subtopic, update_time)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(card_id) DO UPDATE SET x = excluded.x, y = excluded.y,
           topic = excluded.topic, subtopic = excluded.subtopic, update_time = excluded.update_time`
      )
      .run(node.cardId, node.x, node.y, node.topic, node.subtopic, Date.now());
  }

  static removeNode(indexDb: Database.Database, cardId: number) {
    indexDb.prepare("DELETE FROM knowledge_map_nodes WHERE card_id = ?").run(cardId);
  }

  /** 单张卡的均值向量与语义近邻（增量放置用），在已有向量里暴力比对 */
  static neighborsOf(
    indexDb: Database.Database,
    cardId: number,
    k: number
  ): Array<{ cardId: number; similarity: number }> {
    if (!hasTable(indexDb, "vec_documents")) return [];
    const own = indexDb
      .prepare("SELECT vec_embedding FROM vec_documents WHERE prefixed_id = ?")
      .all(`card:${cardId}`) as Array<{ vec_embedding: Buffer }>;
    if (own.length === 0) return [];
    // 用 sqlite-vec 的 KNN：每个分块各查一次近邻，按卡片取最高相似度
    const best = new Map<number, number>();
    const statement = indexDb.prepare(
      `SELECT prefixed_id, distance FROM vec_documents
       WHERE vec_embedding MATCH ? AND k = ? AND type = 'card'`
    );
    for (const chunk of own) {
      for (const row of statement.all(chunk.vec_embedding, k * 3) as Array<{
        prefixed_id: string;
        distance: number;
      }>) {
        const id = Number(row.prefixed_id.split(":")[1]);
        if (id === cardId || !Number.isFinite(id)) continue;
        // cosine 距离 → 相似度
        const similarity = 1 - row.distance;
        if (similarity > (best.get(id) ?? -Infinity)) best.set(id, similarity);
      }
    }
    return [...best.entries()]
      .map(([id, similarity]) => ({ cardId: id, similarity }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);
  }
}
