import * as Y from "yjs";
import {
  assertContentResourceSpecs,
  type ContentResourceDeclarations,
  type ContentResourceSpec,
} from "@tau/db-schema/content-resources";
import { CollaborationError } from "./protocol";
import { assertLegacyDocument } from "./document-version";

/**
 * 资源声明随协作文档传递：节点类型 → 资源字段。协作层只按它找资源（上传、改写、校验），
 * 不按字段名推断；接收端没有对应插件也能按随文档的声明处理资源。
 */
const RESOURCES_KEY = "resources";
const MAX_TYPES = 256;

const resourceMap = (doc: Y.Doc) => {
  assertLegacyDocument(doc);
  return doc.getMap<unknown>(RESOURCES_KEY);
};

/**
 * 读取文档携带的声明。strict 时声明损坏即抛 INVALID_CONTENT（服务端与发布前校验），
 * 否则跳过损坏的类型。
 */
export function readDocumentResources(doc: Y.Doc, strict = false): ContentResourceDeclarations {
  const map = resourceMap(doc);
  if (strict && map.size > MAX_TYPES)
    throw new CollaborationError("INVALID_CONTENT", "资源声明过多");
  const declarations: Record<string, readonly ContentResourceSpec[]> = {};
  for (const [type, value] of map) {
    try {
      const specs = value instanceof Y.AbstractType ? value.toJSON() : value;
      assertContentResourceSpecs(specs);
      declarations[type] = specs;
    } catch {
      if (strict) throw new CollaborationError("INVALID_CONTENT", "资源声明无效");
    }
  }
  return Object.freeze(declarations);
}

/** 文档里出现的节点类型（不含私有块占位的真身） */
export function contentNodeTypes(nodes: readonly unknown[]): Set<string> {
  const types = new Set<string>();
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const node = value as { type?: unknown; children?: unknown };
    if (typeof node.type === "string") types.add(node.type);
    if (Array.isArray(node.children)) node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return types;
}

/**
 * 把本机已知、文档里出现但尚未声明的节点类型写进文档。已有的声明不覆盖：
 * 不同版本的成员各写各的会来回改写同一项。返回是否写入。
 */
export function declareDocumentResources(
  doc: Y.Doc,
  catalog: ContentResourceDeclarations,
  nodes: readonly unknown[],
  origin?: unknown
): boolean {
  const map = resourceMap(doc);
  const missing = [...contentNodeTypes(nodes)].filter(
    type => Object.hasOwn(catalog, type) && !map.has(type)
  );
  if (!missing.length) return false;
  doc.transact(() => {
    for (const type of missing) map.set(type, structuredClone(catalog[type]) as never);
  }, origin);
  return true;
}
