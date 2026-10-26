import * as Y from "yjs";
import {
  NODE_CONTRACT_PROPERTY,
  validateContentContracts,
  type ContentContractDictionary,
} from "@tau/db-schema/content-contracts";
import { NodeTree } from "./node-tree";
import { NODE_TREE_LIMITS } from "./model-limits";
import { CollaborationError, type ContentNode, type SharedContent } from "./protocol";
import { sharedValueEquals } from "./shared-values";
import { contentResourceSlots, contentResourceValues } from "@tau/db-schema/content-resources";
import { isSafeResource } from "./resource-policy";

import { NODE_DOCUMENT_VERSION, readDocumentIdentity } from "./document-version";
export { NODE_DOCUMENT_VERSION } from "./document-version";
export const NODE_DOCUMENT_MAX_BYTES = 8 * 1024 * 1024;
const ROOTS = [
  "meta",
  "title",
  "node-tree:nodes",
  "node-tree:root",
  "node-tree:creations",
  "node-tree:segments",
  "node-tree:contracts",
];

export interface NodeDocumentIdentity {
  documentId: string;
  baselineId: string;
  epoch: number;
}

const fail = (code: string, message: string): never => {
  throw new CollaborationError(code, message, 409);
};
const identifier = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 256 &&
  ![...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);

function json(value: unknown, depth = 0): void {
  if (depth > 64) fail("INVALID_DOCUMENT", "数据嵌套超过限制");
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    value.forEach(item => json(item, depth + 1));
    return;
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, item] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key))
        fail("INVALID_DOCUMENT", "数据属性无效");
      json(item, depth + 1);
    }
    return;
  }
  fail("INVALID_DOCUMENT", "文档必须包含有限 JSON 数据");
}

function sameType(left: unknown, right: unknown): boolean {
  if (!(left instanceof Y.AbstractType) || !(right instanceof Y.AbstractType)) return false;
  return (
    left.constructor === right.constructor &&
    left._item?.id.client === right._item?.id.client &&
    left._item?.id.clock === right._item?.id.clock
  );
}

function complete(doc: Y.Doc): void {
  if (doc.store.pendingStructs || doc.store.pendingDs)
    fail("MISSING_DEPENDENCIES", "更新缺少先行结构，尚未确认持久化，请补齐依赖后重试");
}

/** 也检查冲突中未成为可见值的身份写入，避免旧全量状态借新票据重放。 */
export function assertStableDocumentIdentity(doc: Y.Doc, previous: Y.Doc): void {
  const vector = Y.decodeStateVector(Y.encodeStateVector(previous)),
    meta = doc.getMap("meta");
  for (const key of ["kind", "version", "documentId", "baselineId", "epoch"]) {
    let item = meta._map.get(key);
    while (item) {
      if (item.id.clock >= (vector.get(item.id.client) ?? 0))
        fail("BASELINE_CONFLICT", "普通更新不能写入文档身份元数据");
      item = item.left instanceof Y.Item ? item.left : undefined;
    }
  }
}

export async function createNodeDocument(
  identity: NodeDocumentIdentity,
  content: SharedContent,
  contracts: ContentContractDictionary
): Promise<Y.Doc> {
  const doc = new Y.Doc({ gc: false });
  const tree = new NodeTree(doc);
  try {
    await tree.installContracts(contracts, null);
    doc.transact(() => {
      const meta = doc.getMap("meta");
      for (const [key, value] of Object.entries({
        ...identity,
        version: NODE_DOCUMENT_VERSION,
        bannerBg: content.bannerBg,
        bannerPosition: content.bannerPosition,
      }))
        meta.set(key, value);
      doc.getText("title").insert(0, content.title);
      content.content.forEach((node, index) => tree.insertNode(node, null, index, null, true));
    }, null);
    await validateNodeDocument(doc, identity);
    return doc;
  } catch (error) {
    doc.destroy();
    throw error;
  } finally {
    tree.dispose();
  }
}

/** 检查完整候选；调用方仍须在持久化事务内核对修订并安装。 */
export async function validateNodeDocument(
  doc: Y.Doc,
  identity?: NodeDocumentIdentity,
  previous?: Y.Doc
): Promise<void> {
  try {
    await validateCompleteDocument(doc, identity, previous);
  } catch (error) {
    if (error instanceof CollaborationError) throw error;
    throw new CollaborationError("INVALID_DOCUMENT", "文档结构或契约无效", 400);
  }
}

async function validateCompleteDocument(
  doc: Y.Doc,
  identity?: NodeDocumentIdentity,
  previous?: Y.Doc
): Promise<void> {
  complete(doc);
  if (Y.encodeStateAsUpdate(doc).byteLength > NODE_DOCUMENT_MAX_BYTES)
    fail("DOCUMENT_TOO_LARGE", "文档超过容量限制");
  if (!doc.share.has("meta") || [...doc.share.keys()].some(key => !ROOTS.includes(key)))
    fail("INVALID_DOCUMENT", "文档根结构与协议不匹配");
  const meta = doc.getMap("meta");
  if (meta._start !== null) fail("INVALID_DOCUMENT", "文档映射不能混入序列内容");
  if (
    [...meta.keys()].some(
      key =>
        !["version", "documentId", "baselineId", "epoch", "bannerBg", "bannerPosition"].includes(
          key
        )
    )
  )
    fail("INVALID_DOCUMENT", "文档元信息与协议不匹配");
  if (
    meta.get("version") !== NODE_DOCUMENT_VERSION ||
    !identifier(meta.get("documentId")) ||
    !identifier(meta.get("baselineId")) ||
    !Number.isSafeInteger(meta.get("epoch")) ||
    Number(meta.get("epoch")) < 0
  )
    fail("UNSUPPORTED_DOCUMENT", "文档身份或协议版本无效");
  if (["bannerBg", "bannerPosition"].some(key => typeof meta.get(key) !== "string"))
    fail("INVALID_DOCUMENT", "文档元信息无效");
  if (
    doc.getText("title").length > 500 ||
    !isSafeResource(String(meta.get("bannerBg")), "bannerBg")
  )
    fail("INVALID_DOCUMENT", "共享标题过长或背景包含本地路径");
  if (
    doc.getText("title")._map.size ||
    doc
      .getText("title")
      .toDelta()
      .some(
        (part: { insert?: unknown; attributes?: object }) =>
          typeof part.insert !== "string" || Object.keys(part.attributes ?? {}).length
      )
  )
    fail("INVALID_DOCUMENT", "文档标题必须是无格式共享文本");
  if (identity && Object.entries(identity).some(([key, value]) => meta.get(key) !== value))
    fail("BASELINE_CONFLICT", "文档基线或代次不匹配");
  if (previous) {
    assertStableDocumentIdentity(doc, previous);
    const before = previous.getMap("meta");
    if (
      ["version", "documentId", "baselineId", "epoch"].some(
        key => before.get(key) !== meta.get(key)
      )
    )
      fail("BASELINE_CONFLICT", "普通增量不能切换文档基线");
  }
  await validateNodeTree(doc, "content", previous);
}

/** 正文与白板富文本根共用候选校验，不依赖任何渲染或插件代码。 */
export async function validateNodeTree(
  doc: Y.Doc,
  rootId = "content",
  previous?: Y.Doc
): Promise<void> {
  const tree = new NodeTree(doc, { rootId }),
    old = previous && new NodeTree(previous, { rootId });
  try {
    for (const map of [tree.nodes, tree.contracts, tree.creations, tree.segments.records])
      if (map._start !== null) fail("INVALID_DOCUMENT", "文档映射不能混入序列内容");
    for (const contract of tree.contracts.values())
      if (contract instanceof Y.AbstractType) fail("INVALID_DOCUMENT", "契约必须是不可变 JSON");
    const dictionary = await validateContentContracts(tree.contracts.toJSON());
    if (old)
      for (const [id, value] of old.contracts) {
        if (!sharedValueEquals(value, dictionary[id]))
          fail("IMMUTABLE_CONTRACT", "已有契约不能删除或修改");
      }
    if (
      tree.nodes.size > NODE_TREE_LIMITS.nodes ||
      tree.segments.records.size > NODE_TREE_LIMITS.nodes * 4
    )
      fail("DOCUMENT_TOO_LARGE", "节点或正文片段超过预算");
    for (const [id, record] of tree.nodes) {
      if (!identifier(id) || !(record instanceof Y.Map)) fail("INVALID_DOCUMENT", "节点记录无效");
      const properties = tree.properties(id),
        fields = tree.fields(id);
      const contractId = properties.get(NODE_CONTRACT_PROPERTY);
      if (typeof contractId !== "string" || !dictionary[contractId])
        fail("MISSING_CONTRACT", "节点缺少契约");
      const contract = tree.contract(id)!;
      json(properties.toJSON());
      if (["children", "text", "collabId", ...contract.textFields].some(key => properties.has(key)))
        fail("INVALID_DOCUMENT", "共享字段或宿主结构不能作为普通属性覆盖");
      for (const field of contract.textFields) {
        const value = fields.get(field);
        if (
          !(value instanceof Y.Text) ||
          value.constructor !== Y.Text ||
          value
            .toDelta()
            .some(
              (part: { insert?: unknown; attributes?: object }) =>
                typeof part.insert !== "string" || Object.keys(part.attributes ?? {}).length
            )
        )
          fail("INVALID_DOCUMENT", "声明的源码字段必须为无格式共享文本");
      }
      for (const [field, value] of fields) {
        if (!contract.textFields.includes(field))
          fail("INVALID_DOCUMENT", "共享字段未在节点契约中声明");
        json(value instanceof Y.AbstractType ? value.toJSON() : value);
      }
      const payload = { ...properties.toJSON(), ...fields.toJSON() };
      for (const slot of contentResourceSlots(payload, contract.resources))
        for (const value of contentResourceValues(slot))
          if (!isSafeResource(value))
            fail("INVALID_DOCUMENT", "共享资源包含本地路径或私有资源地址");
      const deletions = record.get("deletions");
      if (
        !identifier(record.get("creation")) ||
        !(deletions instanceof Y.Map) ||
        [...deletions.entries()].some(([key, value]) => !identifier(key) || value !== true)
      )
        fail("INVALID_DOCUMENT", "节点可见性记录无效");
      if (!tree.isDeleted(id)) tree.placement(id);
      tree.segments.list(id, true);
      if (old?.nodes.has(id)) {
        const before = old.record(id);
        for (const key of ["properties", "fields", "content", "flow", "deletions"])
          if (!sameType(before.get(key), record.get(key)))
            fail("CONTENT_IDENTITY_CHANGED", "普通增量不能重建节点存储身份");
        if (!sameType(before, record) || before.get("creation") !== record.get("creation"))
          fail("CONTENT_IDENTITY_CHANGED", "普通增量不能重建节点身份");
        const prior = old.contract(id)!;
        if (
          old.properties(id).get(NODE_CONTRACT_PROPERTY) !== contractId &&
          (prior.type === contract.type ||
            prior.kind !== contract.kind ||
            prior.isVoid !== contract.isVoid ||
            !sharedValueEquals(prior.textFields, contract.textFields))
        )
          fail("CONTRACT_VERSION_CONFLICT", "普通编辑不支持改变数据契约版本");
        for (const field of prior.textFields)
          if (!sameType(old.fields(id).get(field), fields.get(field)))
            fail("CONTENT_IDENTITY_CHANGED", "普通增量不能重建共享文本字段");
      }
    }
    for (const [id, record] of tree.segments.records) {
      if (
        !identifier(id) ||
        !(record instanceof Y.Map) ||
        !tree.nodes.has(tree.segments.source(id))
      )
        fail("INVALID_DOCUMENT", "正文片段来源无效");
      tree.segments.placement(id);
      if (!tree.segments.ranges(tree.segments.source(id)).has(id))
        fail("INVALID_DOCUMENT", "正文片段缺少分界");
      if (old?.segments.records.has(id)) {
        const before = old.segments.records.get(id)!;
        if (
          !sameType(before, record) ||
          before.get("source") !== record.get("source") ||
          !sharedValueEquals(before.get("base"), record.get("base"))
        )
          fail("CONTENT_IDENTITY_CHANGED", "普通增量不能重建正文片段");
      }
    }
    if (
      old &&
      ([...old.nodes.keys()].some(id => !tree.nodes.has(id)) ||
        [...old.segments.records.keys()].some(id => !tree.segments.records.has(id)))
    )
      fail("CONTENT_IDENTITY_CHANGED", "普通增量不能物理移除稳定记录");
    for (const source of [null, ...tree.nodes.keys()]) {
      for (const delta of tree.content(source).toDelta()) {
        json(delta.attributes ?? {});
        if (typeof delta.insert === "string") {
          if (source === null && delta.insert) fail("INVALID_DOCUMENT", "文档根不能直接包含文字");
          continue;
        }
        const value = delta.insert;
        if (
          !value ||
          typeof value !== "object" ||
          value instanceof Y.AbstractType ||
          (!(
            typeof value.node === "string" &&
            identifier(value.token) &&
            tree.nodes.has(value.node)
          ) &&
            !(
              source !== null &&
              typeof value.cut === "string" &&
              tree.segments.source(value.cut) === source
            ))
        )
          fail("INVALID_DOCUMENT", "正文引用或分界无效");
      }
    }
    tree.read();
  } finally {
    tree.dispose();
    old?.dispose();
  }
}

export async function applyNodeDocumentUpdate(
  current: Y.Doc,
  update: Uint8Array,
  identity: NodeDocumentIdentity
): Promise<Y.Doc> {
  if (!update.byteLength || update.byteLength > NODE_DOCUMENT_MAX_BYTES)
    fail("INVALID_UPDATE", "更新容量无效");
  const candidate = new Y.Doc({ gc: false });
  try {
    Y.applyUpdate(candidate, Y.encodeStateAsUpdate(current));
    Y.applyUpdate(candidate, update);
    await validateNodeDocument(candidate, identity, current);
    return candidate;
  } catch (error) {
    candidate.destroy();
    if (!(error instanceof CollaborationError))
      throw new CollaborationError("INVALID_UPDATE", "文档增量损坏或不兼容", 400);
    throw error;
  }
}

function assertReadableNodeDocument(doc: Y.Doc) {
  if (readDocumentIdentity(doc).version !== NODE_DOCUMENT_VERSION)
    fail("UNSUPPORTED_DOCUMENT", "该入口只读取当前正文协议 2");
  if ([...doc.share.keys()].some(key => !ROOTS.includes(key)))
    fail("INVALID_DOCUMENT", "文档根结构与协议不匹配");
}

export function readNodeDocument(doc: Y.Doc): SharedContent {
  assertReadableNodeDocument(doc);
  const tree = new NodeTree(doc),
    meta = doc.getMap("meta");
  try {
    return {
      title: doc.getText("title").toString(),
      bannerBg: String(meta.get("bannerBg")),
      bannerPosition: String(meta.get("bannerPosition")),
      content: tree.read() as ContentNode[],
    };
  } finally {
    tree.dispose();
  }
}

/** 保留记录也可能被撤销重新显示；只读取各自契约声明的资源位置。 */
export function collectNodeDocumentResources(doc: Y.Doc): string[] {
  assertReadableNodeDocument(doc);
  const tree = new NodeTree(doc),
    references = new Set<string>();
  try {
    for (const [id] of tree.nodes) {
      const contract = tree.contract(id);
      if (!contract) throw new Error("资源节点契约缺失");
      const payload = { ...tree.properties(id).toJSON(), ...tree.fields(id).toJSON() };
      for (const slot of contentResourceSlots(payload, contract.resources))
        for (const reference of contentResourceValues(slot)) references.add(reference);
    }
    const banner = doc.getMap("meta").get("bannerBg");
    if (typeof banner === "string" && banner) references.add(banner);
    return [...references];
  } finally {
    tree.dispose();
  }
}
