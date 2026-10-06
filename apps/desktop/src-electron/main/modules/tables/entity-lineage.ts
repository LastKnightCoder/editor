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
  static getListenEvents() {
    return {
      "lineage:record": this.record.bind(this),
      "lineage:find-dst": this.findDst.bind(this),
    };
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

  /** 删掉指向这一端、某种关系的全部谱系（撤回一张刚建、还没写的卡片时用），返回删除行数 */
  static removeToDst(db: Database.Database, dst: LineageNode, relation: LineageRelation): number {
    const stored = toStoredLineageNode(dst);
    return db
      .prepare(`DELETE FROM entity_lineage WHERE dst_kind = ? AND dst_id = ? AND relation = ?`)
      .run(stored.kind, stored.id, relation).changes;
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
