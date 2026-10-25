import type Database from "better-sqlite3";
import * as Y from "yjs";
import { collectWhiteboardDocumentResources } from "@tau/collaboration";
import {
  contentResourceSlots,
  contentResourceValues,
  collectContentResources,
} from "@tau/db-schema/content-resources";
import { NODE_CONTRACT_PROPERTY } from "@tau/db-schema/content-contracts";
import { ContentDocumentTable } from "../tables/content-document";
import PluginElementResourcesTable from "../tables/plugin-element-resources";
import { dataFieldModels } from "../tables/field-models";
import type { RetainedContentEntity } from "./content-retention";

/** 文件解释由节点契约和字段 model 提供；旧白板只在保全入口解释历史媒体结构。 */
export function contentRecoveryResources(
  db: Database.Database,
  dependencies: readonly RetainedContentEntity[]
): string[] {
  const resources = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string" && value) resources.add(value);
  };
  const legacy = PluginElementResourcesTable.catalog(db);
  const fields = new Map(dataFieldModels.map(model => [model.type, model]));
  const hasBoards = Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE name='whiteboard_document_pages'").get()
  );
  const boards = new Set<string>();
  let visited = 0;
  const legacyBoard = (value: unknown, depth = 0) => {
    if (++visited > 500_000 || depth > 64) throw new Error("旧白板资源结构超过预算");
    if (Array.isArray(value)) {
      value.forEach(item => legacyBoard(item, depth + 1));
      return;
    }
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (["image", "video", "audio"].includes(String(node.type))) add(node.src);
    if (Array.isArray(node.children)) legacyBoard(node.children, depth + 1);
  };
  for (const dependency of dependencies) {
    if (dependency.kind === "content") {
      const row = db.prepare("SELECT content FROM contents WHERE id=?").get(dependency.id) as
        | { content: string }
        | undefined;
      if (!row) throw new Error("被持有的正文已缺失");
      const document = ContentDocumentTable.read(db, dependency.id);
      if (!document) {
        const content = JSON.parse(row.content);
        const restoreFolded = (nodes: Record<string, unknown>[], depth = 0) => {
          if (depth > 64) throw new Error("旧正文层级超过预算");
          for (const node of nodes) {
            if (++visited > 500_000) throw new Error("旧正文结构超过预算");
            if (
              node.type === "list-item" &&
              node.isFold === true &&
              Array.isArray(node.allContent) &&
              Array.isArray(node.children)
            )
              node.children = [...node.children, ...node.allContent.slice(1)];
            if (Array.isArray(node.children)) restoreFolded(node.children, depth + 1);
          }
        };
        restoreFolded(content);
        collectContentResources(content, legacy).forEach(resource => add(resource.url));
        continue;
      }
      const walk = (node: Record<string, unknown>, depth: number) => {
        if (++visited > 500_000 || depth > 64) throw new Error("正文资源结构超过预算");
        if (!Array.isArray(node.children)) return;
        const id = node[NODE_CONTRACT_PROPERTY],
          contract = typeof id === "string" ? document.contracts[id] : undefined;
        if (!contract || contract.domain !== "editor-node" || contract.type !== node.type)
          throw new Error("恢复正文契约缺失");
        for (const slot of contentResourceSlots(node, contract.resources))
          contentResourceValues(slot).forEach(add);
        node.children.forEach(child => walk(child, depth + 1));
      };
      document.content.forEach(node => walk(node, 0));
    } else if (dependency.kind === "data-table") {
      const row = db
        .prepare("SELECT columns,rows FROM data_tables WHERE id=?")
        .get(dependency.id) as { columns: string; rows: string } | undefined;
      if (!row) throw new Error("被持有的数据表已缺失");
      const columns = JSON.parse(row.columns) as import("@tau/shared/database-types").ColumnDef[],
        values = JSON.parse(row.rows) as Record<string, unknown>[];
      for (const column of columns) {
        const model = fields.get(column.type);
        if (!model) throw new Error("未知字段类型无法核对文件，请先在原环境完成转换");
        for (const value of values) {
          for (const slot of contentResourceSlots({ value: value[column.id] }, model.resources)) {
            contentResourceValues(slot).forEach(add);
          }
        }
      }
    } else if (dependency.kind === "whiteboard-content") {
      const page = hasBoards
        ? (db
            .prepare("SELECT document_id FROM whiteboard_document_pages WHERE content_id=?")
            .get(dependency.id) as { document_id: string } | undefined)
        : undefined;
      if (page) {
        if (boards.has(page.document_id)) continue;
        boards.add(page.document_id);
        const row = db
          .prepare("SELECT state FROM whiteboard_documents WHERE document_id=?")
          .get(page.document_id) as { state: Buffer } | undefined;
        if (!row) throw new Error("被持有的白板文档已缺失");
        const doc = new Y.Doc({ gc: false });
        try {
          Y.applyUpdate(doc, row.state);
          collectWhiteboardDocumentResources(doc).forEach(add);
        } finally {
          doc.destroy();
        }
      } else {
        const row = db
          .prepare("SELECT data FROM white_board_contents WHERE id=?")
          .get(dependency.id) as { data: string } | undefined;
        if (!row) throw new Error("被持有的白板页已缺失");
        legacyBoard(JSON.parse(row.data));
      }
    }
  }
  return [...resources];
}
