import Database from "better-sqlite3";
import {
  fromStoredLineageNode,
  isLineageRelation,
  type LineageAnchor,
  type LineageNode,
  type LineageNodeKind,
  type LineageRecord,
  type LineageRelation,
  toStoredLineageNode,
} from "@/entity/lineage";

export interface LineageEdge {
  node: LineageNode;
  relation: LineageRelation;
  anchor: LineageAnchor | null;
  createTime: number;
}

interface LineageRow {
  kind: string;
  id: string;
  relation: string;
  src_anchor: string | null;
  create_time: number;
}

const parseAnchor = (raw: string | null): LineageAnchor | null => {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as LineageAnchor;
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
};

const toEdges = (rows: LineageRow[]): LineageEdge[] =>
  rows.flatMap(row => {
    const node = fromStoredLineageNode(row.kind, row.id);
    if (!node || !isLineageRelation(row.relation)) return [];
    return [
      {
        node,
        relation: row.relation,
        anchor: parseAnchor(row.src_anchor),
        createTime: row.create_time,
      },
    ];
  });

/** 端点列表 → `(kind = ? AND id = ?) OR …`；空列表返回恒假 */
const endpointsWhere = (prefix: "src" | "dst", nodes: LineageNode[]) => {
  if (nodes.length === 0) return { sql: "0", params: [] as string[] };
  return {
    sql: nodes.map(() => `(${prefix}_kind = ? AND ${prefix}_id = ?)`).join(" OR "),
    params: nodes.flatMap(node => {
      const stored = toStoredLineageNode(node);
      return [stored.kind, stored.id];
    }),
  };
};

/**
 * 谱系（主库 entity_lineage）：记录「A 衍生出 B」中推导不出的事实。弱引用：两端删除不级联，
 * 读取方遇到解析不到的端点自行降级。
 */
export default class EntityLineageTable {
  static upgradeTable(_db: Database.Database) {}

  static getListenEvents() {
    return {
      "lineage:record": this.record.bind(this),
      "lineage:find-dst": this.findDst.bind(this),
      "lineage:get-anchor": this.getAnchor.bind(this),
    };
  }

  static getAnchor(db: Database.Database, id: number, contentId: number): LineageAnchor | null {
    const row = db
      .prepare(
        `SELECT src_anchor FROM entity_lineage l WHERE l.id = ? AND (
      (src_kind = 'article' AND EXISTS (SELECT 1 FROM articles a WHERE a.id = CAST(l.src_id AS INTEGER) AND a.content_id = ?)) OR
      (src_kind = 'card' AND EXISTS (SELECT 1 FROM cards c WHERE c.id = CAST(l.src_id AS INTEGER) AND c.content_id = ?)) OR
      (src_kind = 'project-item' AND EXISTS (SELECT 1 FROM project_item p WHERE p.id = CAST(l.src_id AS INTEGER) AND p.content_id = ?))
    )`
      )
      .get(id, contentId, contentId, contentId) as { src_anchor: string | null } | undefined;
    return row ? parseAnchor(row.src_anchor) : null;
  }

  /** 幂等：同一 src、dst、relation 只记一次，返回是否新写入 */
  static record(db: Database.Database, record: LineageRecord): boolean {
    if (!isLineageRelation(record.relation)) throw new Error(`未知的谱系关系：${record.relation}`);
    const src = toStoredLineageNode(record.src);
    const dst = toStoredLineageNode(record.dst);
    const result = db
      .prepare(
        `INSERT OR IGNORE INTO entity_lineage
          (src_kind, src_id, src_anchor, dst_kind, dst_id, relation, create_time)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        src.kind,
        src.id,
        record.srcAnchor ? JSON.stringify(record.srcAnchor) : null,
        dst.kind,
        dst.id,
        record.relation,
        Date.now()
      );
    return result.changes > 0;
  }

  /** 按来源与关系查衍生，可限定衍生的类型；按写入时间先后 */
  static findDst(
    db: Database.Database,
    src: LineageNode,
    relation: LineageRelation,
    dstKind?: LineageNodeKind
  ): LineageNode[] {
    const stored = toStoredLineageNode(src);
    const rows = db
      .prepare(
        `SELECT dst_kind AS kind, dst_id AS id, relation, src_anchor, create_time
         FROM entity_lineage
         WHERE src_kind = ? AND src_id = ? AND relation = ? ${dstKind ? "AND dst_kind = ?" : ""}
         ORDER BY id`
      )
      .all(stored.kind, stored.id, relation, ...(dstKind ? [dstKind] : [])) as LineageRow[];
    return toEdges(rows).map(edge => edge.node);
  }

  /** 这些端点（通常是共用一份正文的各个身份）从哪来 */
  static sourcesOf(db: Database.Database, nodes: LineageNode[]): LineageEdge[] {
    const where = endpointsWhere("dst", nodes);
    const rows = db
      .prepare(
        `SELECT src_kind AS kind, src_id AS id, relation, src_anchor, create_time
         FROM entity_lineage WHERE ${where.sql} ORDER BY create_time DESC, id DESC`
      )
      .all(...where.params) as LineageRow[];
    return toEdges(rows);
  }

  /** 这些端点衍生出了什么 */
  static derivedOf(db: Database.Database, nodes: LineageNode[]): LineageEdge[] {
    const where = endpointsWhere("src", nodes);
    const rows = db
      .prepare(
        `SELECT dst_kind AS kind, dst_id AS id, relation, src_anchor, create_time
         FROM entity_lineage WHERE ${where.sql} ORDER BY create_time DESC, id DESC`
      )
      .all(...where.params) as LineageRow[];
    return toEdges(rows);
  }
}
