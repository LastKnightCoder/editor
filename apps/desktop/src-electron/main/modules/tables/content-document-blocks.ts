import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { BLOCK_CONTENT_STORAGE_VERSION, isSupportedContentStorageVersion } from "@tau/db-schema";
import { validateContentContractsSync } from "@tau/db-schema/content-contracts-node";
import {
  canonicalContractJson,
  type ContentContractDictionary,
} from "@tau/db-schema/content-contracts";
import type { ContentEntityRelation } from "@tau/db-schema/content-identities";
import type { ContentNode } from "@tau/collaboration";
import { inspectStoredContent } from "./content-document";
import { applyContentEntityRelations } from "./content-entity-relations";

interface BlockRow {
  block_id: string;
  position: number;
  content: string;
  count: number;
}

export interface ContentBlockWrite {
  documentId: string;
  expectedRevision: string;
  contracts: ContentContractDictionary;
  blocks: ContentNode[];
  order?: readonly string[];
  count: (content: ContentNode[]) => number;
  countRules: string;
}

const identities = (node: ContentNode): string[] => {
  const result: string[] = [];
  const visit = (value: ContentNode) => {
    if (!value.children) return;
    result.push(String(value.collabId));
    value.children.forEach(visit);
  };
  visit(node);
  return result;
};

export class ContentDocumentBlocks {
  private static initialize(
    db: Database.Database,
    contentId: number,
    count: ContentBlockWrite["count"],
    rules: string,
    contracts: ContentContractDictionary
  ) {
    const row = db.prepare("SELECT content FROM contents WHERE id=?").get(contentId) as
      | { content: string | null }
      | undefined;
    if (!row) throw new Error("正文已删除，不能重新创建");
    let cost = 0;
    if (row.content === null) {
      const current = db
        .prepare("SELECT rules FROM content_document_block_counts WHERE content_id=?")
        .get(contentId) as { rules: string } | undefined;
      if (current) {
        try {
          const state = JSON.parse(current.rules) as { metrics: string; cost: number };
          if (
            state.metrics === rules &&
            Number.isSafeInteger(state.cost) &&
            state.cost >= 0 &&
            state.cost <= 500_000
          )
            return state.cost;
        } catch {
          // 派生状态失效时按正文块重建字数与结构预算。
        }
      }
      const blocks = db
        .prepare("SELECT block_id,content FROM content_document_blocks WHERE content_id=?")
        .all(contentId) as { block_id: string; content: string }[];
      const update = db.prepare(
        "UPDATE content_document_blocks SET count=? WHERE content_id=? AND block_id=?"
      );
      for (const block of blocks) {
        const node = JSON.parse(block.content) as ContentNode;
        cost += inspectStoredContent([node], contracts).cost;
        update.run(count([node]), contentId, block.block_id);
      }
    } else {
      const nodes = JSON.parse(row.content) as ContentNode[];
      db.prepare("DELETE FROM content_document_blocks WHERE content_id=?").run(contentId);
      const insertBlock = db.prepare(
        "INSERT INTO content_document_blocks(content_id,block_id,position,content,count) VALUES (?,?,?,?,?)"
      );
      const insertNode = db.prepare(
        "INSERT INTO content_document_node_blocks(content_id,node_id,block_id) VALUES (?,?,?)"
      );
      nodes.forEach((node, position) => {
        cost += inspectStoredContent([node], contracts).cost;
        const id = String(node.collabId);
        insertBlock.run(contentId, id, position, JSON.stringify(node), count([node]));
        for (const nodeId of identities(node)) insertNode.run(contentId, nodeId, id);
      });
    }
    if (cost > 500_000) throw new Error("正文数据超过预算");
    db.prepare(
      "UPDATE contents SET content=NULL,count=(SELECT COALESCE(sum(count),0) FROM content_document_blocks WHERE content_id=?) WHERE id=?"
    ).run(contentId, contentId);
    db.prepare("UPDATE content_documents SET format_version=? WHERE content_id=?").run(
      BLOCK_CONTENT_STORAGE_VERSION,
      contentId
    );
    db.prepare(
      "INSERT INTO content_document_block_counts(content_id,rules) VALUES (?,?) ON CONFLICT(content_id) DO UPDATE SET rules=excluded.rules"
    ).run(contentId, JSON.stringify({ metrics: rules, cost }));
    return cost;
  }

  static commit(db: Database.Database, contentId: number, value: ContentBlockWrite) {
    return db.transaction(() => {
      const previous = db
        .prepare(
          "SELECT document_id,format_version,contracts,revision FROM content_documents WHERE content_id=?"
        )
        .get(contentId) as
        | { document_id: string; format_version: number; contracts: string; revision: string }
        | undefined;
      if (!previous || !isSupportedContentStorageVersion(previous.format_version))
        throw new Error("正文数据格式不兼容");
      if (previous.document_id !== value.documentId || previous.revision !== value.expectedRevision)
        throw new Error("正文投影修订冲突，已保留原缓存并暂停写入");
      const contracts = validateContentContractsSync(value.contracts);
      const oldContracts = JSON.parse(previous.contracts) as ContentContractDictionary;
      for (const [id, contract] of Object.entries(oldContracts))
        if (
          !Object.hasOwn(contracts, id) ||
          canonicalContractJson(contract) !== canonicalContractJson(contracts[id])
        )
          throw new Error("已有契约不能删除或修改");
      const contractsJson = JSON.stringify(contracts);
      const contractsChanged =
        canonicalContractJson(oldContracts) !== canonicalContractJson(contracts);
      if (!value.blocks.length && !value.order) {
        if (!contractsChanged)
          return { revision: previous.revision, changed: false, writtenBlocks: 0 };
        const revision = createHash("sha256")
          .update(previous.revision)
          .update(contractsJson)
          .digest("hex");
        db.prepare("UPDATE content_documents SET contracts=?,revision=? WHERE content_id=?").run(
          contractsJson,
          revision,
          contentId
        );
        return { revision, changed: false, writtenBlocks: 0 };
      }
      const inspected = inspectStoredContent(value.blocks, contracts);
      const relations = inspected.relations;
      const previousCost = this.initialize(db, contentId, value.count, value.countRules, contracts);
      const ordered = value.order && new Map(value.order.map((id, index) => [id, index]));
      if (ordered && ordered.size !== value.order!.length)
        throw new Error("正文块顺序包含重复身份");
      if (
        ordered &&
        (ordered.size !== value.blocks.length ||
          value.blocks.some(node => !ordered.has(String(node.collabId))))
      )
        throw new Error("结构保存必须包含完整正文块与顺序");
      const previousOrder = ordered
        ? (db
            .prepare(
              "SELECT block_id FROM content_document_blocks WHERE content_id=? ORDER BY position,block_id"
            )
            .all(contentId) as { block_id: string }[])
        : undefined;
      const removed =
        previousOrder?.filter(row => !ordered!.has(row.block_id)).map(row => row.block_id) ?? [];
      const readBlock = db.prepare(
        "SELECT block_id,position,content,count FROM content_document_blocks WHERE content_id=? AND block_id=?"
      );
      const changed = value.blocks.flatMap(node => {
        const id = String(node.collabId);
        const old = readBlock.get(contentId, id) as BlockRow | undefined;
        const position = ordered?.get(id) ?? old?.position;
        if (position === undefined) throw new Error("新增正文块缺少顺序");
        const content = JSON.stringify(node);
        const count = value.count([node]);
        if (!Number.isSafeInteger(count) || count < 0) throw new Error("正文块字数无效");
        if (old?.content === content && old.position === position && old.count === count) return [];
        const oldCost = old ? inspectStoredContent([JSON.parse(old.content)], contracts).cost : 0;
        return [
          {
            id,
            node,
            nodeIds: identities(node),
            content,
            count,
            position,
            old,
            oldCost,
            cost: inspected.costs.get(id)!,
          },
        ];
      });
      const affected = new Set([...changed.map(block => block.id), ...removed]);
      const removedRows = removed.map(id => readBlock.get(contentId, id) as BlockRow);
      const cost =
        previousCost +
        changed.reduce((total, block) => total + block.cost - block.oldCost, 0) -
        removedRows.reduce(
          (total, block) =>
            total + inspectStoredContent([JSON.parse(block.content)], contracts).cost,
          0
        );
      if (cost > 500_000 || cost < 0) throw new Error("正文数据超过预算");
      if (!affected.size && !contractsChanged)
        return { revision: previous.revision, changed: false, writtenBlocks: 0 };
      const before: ContentEntityRelation[] = [];
      const oldRelations = db.prepare(
        "SELECT r.node_id,r.slot,r.source_id,r.entity_kind,r.entity_id FROM content_entity_relations r JOIN content_document_node_blocks n ON n.content_id=? AND n.node_id=r.node_id WHERE r.document_id=? AND n.block_id=?"
      );
      const clearRelations = db.prepare(
        "DELETE FROM content_entity_relations WHERE document_id=? AND node_id IN (SELECT node_id FROM content_document_node_blocks WHERE content_id=? AND block_id=?)"
      );
      const clearNodes = db.prepare(
        "DELETE FROM content_document_node_blocks WHERE content_id=? AND block_id=?"
      );
      for (const id of affected) {
        const rows = oldRelations.all(contentId, value.documentId, id) as {
          node_id: string;
          slot: string;
          source_id: string;
          entity_kind: ContentEntityRelation["target"]["kind"];
          entity_id: string;
        }[];
        before.push(
          ...rows.map(row => ({
            nodeId: row.node_id,
            slot: row.slot,
            target: { sourceId: row.source_id, kind: row.entity_kind, entityId: row.entity_id },
          }))
        );
        clearRelations.run(value.documentId, contentId, id);
        clearNodes.run(contentId, id);
      }
      const upsert = db.prepare(
        "INSERT INTO content_document_blocks(content_id,block_id,position,content,count) VALUES (?,?,?,?,?) ON CONFLICT(content_id,block_id) DO UPDATE SET position=excluded.position,content=excluded.content,count=excluded.count"
      );
      const insertNode = db.prepare(
        "INSERT INTO content_document_node_blocks(content_id,node_id,block_id) VALUES (?,?,?)"
      );
      for (const block of changed) {
        upsert.run(contentId, block.id, block.position, block.content, block.count);
        for (const nodeId of block.nodeIds) insertNode.run(contentId, nodeId, block.id);
      }
      let delta = changed.reduce(
        (total, block) => total + block.count - (block.old?.count ?? 0),
        0
      );
      for (const old of removedRows) {
        delta -= old.count;
        db.prepare("DELETE FROM content_document_blocks WHERE content_id=? AND block_id=?").run(
          contentId,
          old.block_id
        );
      }
      const changedNodeIds = new Set(changed.flatMap(block => block.nodeIds));
      const after = relations.filter(relation => changedNodeIds.has(relation.nodeId));
      const relationKey = (relation: ContentEntityRelation) =>
        JSON.stringify([
          relation.nodeId,
          relation.slot,
          relation.target.sourceId,
          relation.target.kind,
          relation.target.entityId,
        ]);
      const oldKeys = new Set(before.map(relationKey)),
        newKeys = new Set(after.map(relationKey));
      const insertRelation = db.prepare(
        "INSERT INTO content_entity_relations(document_id,node_id,slot,source_id,entity_kind,entity_id) VALUES (?,?,?,?,?,?)"
      );
      for (const relation of after)
        insertRelation.run(
          value.documentId,
          relation.nodeId,
          relation.slot,
          relation.target.sourceId,
          relation.target.kind,
          relation.target.entityId
        );
      applyContentEntityRelations(
        db,
        before.filter(relation => !newKeys.has(relationKey(relation))),
        after.filter(relation => !oldKeys.has(relationKey(relation)))
      );
      const revision = createHash("sha256")
        .update(previous.revision)
        .update(JSON.stringify(changed.map(block => [block.id, block.position, block.content])))
        .update(JSON.stringify(removed))
        .update(contractsJson)
        .digest("hex");
      db.prepare(
        "UPDATE content_documents SET format_version=?,contracts=?,revision=? WHERE content_id=?"
      ).run(BLOCK_CONTENT_STORAGE_VERSION, contractsJson, revision, contentId);
      const contentChanged = affected.size > 0;
      if (contentChanged)
        db.prepare("UPDATE contents SET count=count+?,update_time=? WHERE id=?").run(
          delta,
          Date.now(),
          contentId
        );
      db.prepare("UPDATE content_document_block_counts SET rules=? WHERE content_id=?").run(
        JSON.stringify({ metrics: value.countRules, cost }),
        contentId
      );
      return { revision, changed: contentChanged, writtenBlocks: changed.length + removed.length };
    })();
  }
}
