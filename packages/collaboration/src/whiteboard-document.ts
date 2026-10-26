import * as Y from "yjs";
import { WhiteboardModel } from "./whiteboard-model";
import {
  validateNodeTree,
  assertStableDocumentIdentity,
  type NodeDocumentIdentity,
} from "./node-document";
import { NodeTree } from "./node-tree";
import { CollaborationError } from "./protocol";
import { WHITEBOARD_LIMITS } from "./model-limits";
import { contentResourceSlots, contentResourceValues } from "@tau/db-schema/content-resources";
import { isSafeResource } from "./resource-policy";
import type { WhiteboardFieldBindings } from "./whiteboard-types";

import { WHITEBOARD_DOCUMENT_VERSION } from "./document-version";
export { WHITEBOARD_DOCUMENT_VERSION } from "./document-version";
const roots = [
  "meta",
  "whiteboard:meta",
  "whiteboard:title",
  "whiteboard:pages",
  "whiteboard:presentations",
  "whiteboard:presentation-order",
  "whiteboard:page-order",
  "whiteboard:elements",
  "whiteboard:orders",
  "whiteboard:strings",
  "whiteboard:creations",
  "node-tree:contracts",
];
const fail = (code: string, message: string): never => {
  throw new CollaborationError(code, message, 409);
};
const identifier = (value: unknown) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 256 &&
  ![...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);

export async function createWhiteboardDocument(
  identity: NodeDocumentIdentity,
  state: Uint8Array
): Promise<Y.Doc> {
  const doc = new Y.Doc({ gc: false });
  try {
    Y.applyUpdate(doc, state);
    if (doc.share.has("meta"))
      fail("BASELINE_CONFLICT", "共享白板身份必须显式新建，不能覆盖旧代次");
    doc.transact(() => {
      const meta = doc.getMap("meta");
      Object.entries({
        ...identity,
        version: WHITEBOARD_DOCUMENT_VERSION,
        kind: "whiteboard",
      }).forEach(([key, value]) => meta.set(key, value));
    });
    await validateWhiteboardDocument(doc, identity);
    return doc;
  } catch (error) {
    doc.destroy();
    throw error;
  }
}

export async function validateWhiteboardDocument(
  doc: Y.Doc,
  identity?: NodeDocumentIdentity,
  previous?: Y.Doc
): Promise<void> {
  if (doc.store.pendingStructs || doc.store.pendingDs)
    fail("MISSING_DEPENDENCIES", "白板缺少先行结构，尚未确认接纳");
  if (Y.encodeStateAsUpdate(doc).byteLength > WHITEBOARD_LIMITS.documentBytes)
    fail("DOCUMENT_TOO_LARGE", "白板超过容量限制");
  const model = new WhiteboardModel(doc),
    old = previous && new WhiteboardModel(previous);
  try {
    const meta = doc.getMap("meta");
    if (
      meta._start !== null ||
      meta.get("version") !== WHITEBOARD_DOCUMENT_VERSION ||
      meta.get("kind") !== "whiteboard" ||
      !identifier(meta.get("documentId")) ||
      !identifier(meta.get("baselineId")) ||
      !Number.isSafeInteger(meta.get("epoch")) ||
      Number(meta.get("epoch")) < 0 ||
      [...meta.keys()].some(
        key => !["version", "kind", "documentId", "baselineId", "epoch"].includes(key)
      )
    )
      fail("INVALID_DOCUMENT", "白板文档身份或协议无效");
    if (identity && Object.entries(identity).some(([key, value]) => meta.get(key) !== value))
      fail("BASELINE_CONFLICT", "白板身份或代次不匹配");
    if (
      previous &&
      ["version", "kind", "documentId", "baselineId", "epoch"].some(
        key => meta.get(key) !== previous.getMap("meta").get(key)
      )
    )
      fail("BASELINE_CONFLICT", "普通更新不能更换白板基线");
    if (previous) assertStableDocumentIdentity(doc, previous);
    await model.validate(old);
    const allowed = new Set(roots);
    for (const record of model.elements.values()) {
      const binding = record.get("fieldBindings") as WhiteboardFieldBindings;
      if (binding.body?.mode !== "richtext") continue;
      const root = binding.body.rootId,
        prefix = root === "content" ? "node-tree" : `node-tree:roots:${root}`;
      for (const suffix of ["nodes", "root", "creations", "segments"])
        allowed.add(`${prefix}:${suffix}`);
      await validateNodeTree(
        doc,
        root,
        previous?.share.has(`${prefix}:nodes`) ? previous : undefined
      );
    }
    if ([...doc.share.keys()].some(key => !allowed.has(key)))
      fail("INVALID_DOCUMENT", "白板包含未声明的共享根");
    for (const map of [
      model.pages,
      model.elements,
      model.orders,
      model.strings,
      model.creations,
      model.contracts,
      doc.getMap("whiteboard:meta"),
    ])
      if (map._start !== null) fail("INVALID_DOCUMENT", "白板映射不能混入序列内容");
    for (const text of [
      model.title,
      ...model.strings.values(),
      ...[...model.pages.values()].map(page => page.get("title") as Y.Text),
    ])
      if (
        text.constructor !== Y.Text ||
        text._map.size ||
        text
          .toDelta()
          .some(
            (part: { insert?: unknown; attributes?: object }) =>
              typeof part.insert !== "string" || Object.keys(part.attributes ?? {}).length
          )
      )
        fail("INVALID_DOCUMENT", "白板字符串必须使用无格式共享文本");
    for (const ref of collectWhiteboardDocumentResources(doc))
      if (!isSafeResource(ref)) fail("INVALID_DOCUMENT", "白板资源包含未处理的本机路径");
  } catch (error) {
    if (error instanceof CollaborationError) throw error;
    throw new CollaborationError(
      "INVALID_DOCUMENT",
      error instanceof Error ? error.message : "白板结构无效",
      400
    );
  } finally {
    model.dispose();
    old?.dispose();
  }
}

/** 删除与恢复池同样扫描；曾经被替换的资产由服务端历史账另行持有。 */
export function collectWhiteboardDocumentResources(doc: Y.Doc): string[] {
  const model = new WhiteboardModel(doc),
    references = new Set<string>();
  const scan = (payload: unknown, resources: Parameters<typeof contentResourceSlots>[1]) => {
    for (const slot of contentResourceSlots(payload, resources))
      for (const ref of contentResourceValues(slot)) references.add(ref);
  };
  try {
    for (const record of model.elements.values()) {
      const identity = record.get("identity") as { contractId: string },
        contract = model.contracts.get(identity.contractId);
      if (!contract || contract.domain !== "whiteboard-element") throw new Error("白板契约缺失");
      const binding = record.get("fieldBindings") as WhiteboardFieldBindings;
      const data = (record.get("data") as Y.Map<unknown>).toJSON();
      for (const [field, root] of Object.entries(binding.data))
        data[field] = model.strings.get(root)?.toString();
      scan(data, contract.resources);
      if (binding.body?.mode === "richtext") {
        const tree = new NodeTree(doc, { rootId: binding.body.rootId });
        try {
          for (const [id] of tree.nodes) {
            const contract = tree.contract(id);
            if (!contract) throw new Error("富文本契约缺失");
            scan(
              { ...tree.properties(id).toJSON(), ...tree.fields(id).toJSON() },
              contract.resources
            );
          }
        } finally {
          tree.dispose();
        }
      }
    }
    return [...references];
  } finally {
    model.dispose();
  }
}
