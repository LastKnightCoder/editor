import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { applyContentEntityRelations } from "./content-entity-relations";
import type { ContentNode } from "@tau/collaboration";
import {
  NODE_CONTRACT_PROPERTY,
  type ContentContractDictionary,
} from "@tau/db-schema/content-contracts";
import { validateContentContractsSync } from "@tau/db-schema/content-contracts-node";
import {
  isContentEntityReference,
  CONTENT_ENTITY_NODE_CONTRACTS,
  type ContentEntityKind,
  type ContentEntityRelation,
} from "@tau/db-schema/content-identities";

export interface StoredContentDocument {
  documentId: string;
  contracts: ContentContractDictionary;
  content: ContentNode[];
  revision: string;
}
export type ContentDocumentWrite = Omit<StoredContentDocument, "revision">;

const validId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 256 &&
  Array.from(value).every(character => {
    const code = character.charCodeAt(0);
    return code >= 32 && code !== 127;
  });

function validateContent(
  content: ContentNode[],
  contracts: ContentContractDictionary
): ContentEntityRelation[] {
  if (!Array.isArray(content)) throw new Error("正文必须是节点数组");
  const ids = new Set<string>(),
    relations: ContentEntityRelation[] = [];
  let count = 0;
  const json = (value: unknown, depth: number): void => {
    if (depth > 64 || ++count > 500_000) throw new Error("正文数据超过预算");
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    )
      return;
    if (Array.isArray(value)) {
      value.forEach(item => json(item, depth + 1));
      return;
    }
    if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
      for (const [key, item] of Object.entries(value)) {
        if (["__proto__", "constructor", "prototype"].includes(key))
          throw new Error("正文属性无效");
        json(item, depth + 1);
      }
      return;
    }
    throw new Error("正文必须包含有限 JSON 数据");
  };
  const visit = (node: ContentNode, root: boolean, depth = 0) => {
    if (depth > 64) throw new Error("正文层级超过预算");
    if (!node || typeof node !== "object" || Array.isArray(node)) throw new Error("正文节点无效");
    json(Object.fromEntries(Object.entries(node).filter(([key]) => key !== "children")), 0);
    if (typeof node.text === "string" && !Object.hasOwn(node, "children")) {
      if (root) throw new Error("正文根必须包含元素节点");
      return;
    }
    if (!validId(node.collabId) || ids.has(node.collabId) || !Array.isArray(node.children))
      throw new Error("正文节点身份或子树无效");
    ids.add(node.collabId);
    const contractId = node[NODE_CONTRACT_PROPERTY];
    const contract = typeof contractId === "string" ? contracts[contractId] : undefined;
    if (!contract || contract.domain !== "editor-node" || contract.type !== node.type)
      throw new Error("正文节点契约缺失或不匹配");
    for (const field of contract.textFields)
      if (typeof node[field] !== "string") throw new Error("正文源码字段无效");
    const entity = CONTENT_ENTITY_NODE_CONTRACTS[contract.type];
    if (entity && contract.owner === entity.owner) {
      if (!isContentEntityReference(node.entityRef) || node.entityRef.kind !== entity.kind)
        throw new Error("实体引用缺少稳定来源身份");
      relations.push({ nodeId: node.collabId, slot: "entityRef", target: node.entityRef });
    }
    node.children.forEach(child => visit(child, false, depth + 1));
  };
  content.forEach(node => visit(node, true));
  return relations;
}

export class ContentDocumentTable {
  /** 正文与字典是否能通过写入校验；不合格时返回原因，供打开前判断是否需要修复 */
  static problem(content: unknown, contracts: unknown): string | null {
    try {
      validateContent(content as ContentNode[], validateContentContractsSync(contracts as never));
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  static read(db: Database.Database, contentId: number): StoredContentDocument | null {
    const row = db
      .prepare(
        `SELECT d.*,c.content FROM content_documents d JOIN contents c ON c.id=d.content_id WHERE d.content_id=?`
      )
      .get(contentId) as
      | {
          document_id: string;
          format_version: number;
          contracts: string;
          revision: string;
          content: string;
        }
      | undefined;
    if (!row) return null;
    if (row.format_version !== 2) throw new Error("正文数据格式不兼容");
    return {
      documentId: row.document_id,
      contracts: JSON.parse(row.contracts),
      content: JSON.parse(row.content),
      revision: row.revision,
    };
  }

  static commit(
    db: Database.Database,
    contentId: number,
    value: ContentDocumentWrite,
    options: {
      expectedRevision?: string;
      installDocument?: boolean;
      count: number;
      applyRelations?: (
        removed: readonly ContentEntityRelation[],
        added: readonly ContentEntityRelation[]
      ) => void;
    }
  ): StoredContentDocument {
    if (!validId(value.documentId) || !Number.isSafeInteger(options.count) || options.count < 0)
      throw new Error("正文身份或字数无效");
    const contracts = validateContentContractsSync(value.contracts);
    const relations = validateContent(value.content, contracts);
    const contentJson = JSON.stringify(value.content),
      contractsJson = JSON.stringify(contracts);
    const revision = createHash("sha256")
      .update(contentJson)
      .update("\n")
      .update(contractsJson)
      .digest("hex");
    return db.transaction(() => {
      const content = db.prepare("SELECT id FROM contents WHERE id=?").get(contentId);
      if (!content) throw new Error("正文已删除，不能重新创建");
      const previous = this.read(db, contentId);
      if (previous && previous.documentId !== value.documentId)
        throw new Error("正文稳定身份已变化");
      if (previous && options.expectedRevision !== previous.revision)
        throw new Error("正文修订冲突");
      if (!options.installDocument) {
        if (!previous) throw new Error("正文尚未完成格式转换");
        for (const [id, contract] of Object.entries(previous.contracts))
          if (
            !Object.hasOwn(contracts, id) ||
            JSON.stringify(contracts[id]) !== JSON.stringify(contract)
          )
            throw new Error("已有契约不能删除或修改");
      }
      const old = db
        .prepare(
          "SELECT node_id,slot,source_id,entity_kind,entity_id FROM content_entity_relations WHERE document_id=?"
        )
        .all(value.documentId) as {
        node_id: string;
        slot: string;
        source_id: string;
        entity_kind: ContentEntityKind;
        entity_id: string;
      }[];
      const prior: ContentEntityRelation[] = old.map(row => ({
        nodeId: row.node_id,
        slot: row.slot,
        target: { sourceId: row.source_id, kind: row.entity_kind, entityId: row.entity_id },
      }));
      const key = (relation: ContentEntityRelation) =>
        JSON.stringify([
          relation.nodeId,
          relation.slot,
          relation.target.sourceId,
          relation.target.kind,
          relation.target.entityId,
        ]);
      const before = new Set(prior.map(key)),
        after = new Set(relations.map(key));
      const removed = prior.filter(relation => !after.has(key(relation))),
        added = relations.filter(relation => !before.has(key(relation)));
      const applyRelations =
        options.applyRelations ??
        ((removed, added) => applyContentEntityRelations(db, removed, added));
      db.prepare(
        `INSERT INTO content_documents(content_id,document_id,format_version,contracts,revision) VALUES (?,?,2,?,?)
        ON CONFLICT(content_id) DO UPDATE SET contracts=excluded.contracts,revision=excluded.revision`
      ).run(contentId, value.documentId, contractsJson, revision);
      const remove = db.prepare(
        "DELETE FROM content_entity_relations WHERE document_id=? AND node_id=? AND slot=?"
      );
      removed.forEach(relation => remove.run(value.documentId, relation.nodeId, relation.slot));
      const insert = db.prepare(
        "INSERT INTO content_entity_relations(document_id,node_id,slot,source_id,entity_kind,entity_id) VALUES (?,?,?,?,?,?)"
      );
      added.forEach(relation =>
        insert.run(
          value.documentId,
          relation.nodeId,
          relation.slot,
          relation.target.sourceId,
          relation.target.kind,
          relation.target.entityId
        )
      );
      applyRelations(removed, added);
      db.prepare("UPDATE contents SET content=?,count=?,update_time=? WHERE id=?").run(
        contentJson,
        options.count,
        Date.now(),
        contentId
      );
      return { ...value, contracts, content: structuredClone(value.content), revision };
    })();
  }
}
