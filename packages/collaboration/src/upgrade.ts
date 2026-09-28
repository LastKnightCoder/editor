import * as Y from "yjs";
import { slateNodesToInsertDelta, yTextToSlateElement } from "@slate-yjs/core";
import type { Descendant } from "slate";
import {
  LOCAL_FIELDS,
  PRIVATE_BLOCKS,
  RESOURCE_FIELDS,
  getBody,
  getFields,
  materializeNodes,
  prepareNodes,
  readSharedContent,
  setSharedValue,
} from "./document";
import { CollaborationError, type ContentNode } from "./protocol";

const UPGRADE_ORIGIN = "session-upgrade";

/**
 * 本机会话与共享会话的互相转换，就地改同一个 Y.Doc（01 §7.3 第 1 层、ER-009）。
 *
 * 「发起共享」不是换文档，只是换同步方式：正文的 Y.XmlText 保持同一批对象，
 * 渲染端因此不必重建编辑器。升级只做三件最小编辑：私有块换成占位、删除本机字段、
 * 资源引用换成资产引用（外加 meta.mode）。
 */

/** 正文与块字段里需要上传的本地资源引用（私有块不参与共享，跳过） */
export function collectSharedResources(
  doc: Y.Doc,
  privateNodes?: Map<string, ContentNode>
): string[] {
  const references = new Set<string>();
  const visit = (value: unknown, key?: string) => {
    if (Array.isArray(value)) {
      value.forEach(entry => visit(entry));
      return;
    }
    if (!value || typeof value !== "object") {
      if (typeof value === "string" && key && RESOURCE_FIELDS.has(key) && value)
        references.add(value);
      return;
    }
    const node = value as Record<string, unknown>;
    if (PRIVATE_BLOCKS.has(String(node.type))) return;
    for (const [name, entry] of Object.entries(node)) visit(entry, name);
  };
  // 物化内容里块字段已合并进节点，chart config 之类嵌套结构中的资源也能覆盖
  visit(
    materializeNodes(
      doc,
      (getBody(doc).length ? yTextToSlateElement(getBody(doc)).children : []) as ContentNode[],
      privateNodes
    )
  );
  const banner = doc.getMap("meta").get("bannerBg");
  if (typeof banner === "string" && banner) references.add(banner);
  return [...references];
}

/**
 * 本机会话就地升级为共享：私有块换占位（数据移入 `privateNodes`）、删除 `LOCAL_FIELDS`、
 * 资源引用按 `resources` 改写、`meta.mode` 切为 shared。
 *
 * 返回回滚函数：升级后的校验或发布失败时把文档还原到升级前（发布链路的任一步失败都不能
 * 留下「正文已被改成共享形态、会话却还是本机」的半成品）。
 */
export function upgradeLocalDocument(
  doc: Y.Doc,
  privateNodes: Map<string, ContentNode>,
  resources: Map<string, string> = new Map()
): () => void {
  // 隐私边界的前提：关掉 gc 的文档会留下私有块的历史（P0 spike S1 有对照用例）
  if (!doc.gc)
    throw new CollaborationError("INVALID_CONTENT", "文档未启用垃圾回收，不能升级为共享");
  if (doc.getMap("meta").get("mode") !== "local")
    throw new CollaborationError("INVALID_CONTENT", "只有本机会话可以升级为共享");
  // 回滚用内容快照整树还原，不能用 Y.UndoManager：它会 keep 住被删除的私有块内容，
  // 使其留在编码状态里，正好破坏升级要守的隐私边界
  const snapshot = {
    privateNodes: new Map(privateNodes),
    content: structuredClone(readSharedContent(doc, privateNodes).content),
  };
  doc.transact(() => {
    visitBody(doc, getBody(doc), node => {
      const attributes = node.getAttributes() as Record<string, unknown>;
      const type = String(attributes.type || "");
      if (PRIVATE_BLOCKS.has(type)) {
        const collabId = String(attributes.collabId || crypto.randomUUID());
        privateNodes.set(
          collabId,
          materializeNodes(doc, [yTextToSlateElement(node) as ContentNode], privateNodes)[0]
        );
        // 私有块的块字段不参与共享，一并清掉，避免残留在发布状态里
        getFields(doc).delete(collabId);
        return { replaceWith: placeholder(collabId, type) };
      }
      for (const key of Object.keys(attributes)) {
        if (LOCAL_FIELDS.has(key)) node.removeAttribute(key);
        else rewriteAttribute(node, key, attributes[key], resources);
      }
      return {};
    });
    rewriteFields(doc, resources);
    const meta = doc.getMap("meta");
    const banner = meta.get("bannerBg");
    if (typeof banner === "string" && resources.has(banner))
      meta.set("bannerBg", resources.get(banner));
    meta.set("mode", "shared");
  }, UPGRADE_ORIGIN);
  return () => {
    privateNodes.clear();
    for (const [id, node] of snapshot.privateNodes) privateNodes.set(id, node);
    doc.transact(() => {
      doc.getMap("meta").set("mode", "local");
      const body = getBody(doc);
      body.delete(0, body.length);
      body.applyDelta(
        slateNodesToInsertDelta(prepareNodes(doc, snapshot.content) as unknown as Descendant[])
      );
    }, UPGRADE_ORIGIN);
  };
}

/**
 * 共享会话就地降级为本机（结束共享）：占位换回私有块真身、资源引用按 `resources`
 * 换回本地路径、`meta.mode` 切为 local。文档对象不变，渲染端同样不必重建编辑器。
 */
export function downgradeSharedDocument(
  doc: Y.Doc,
  privateNodes: Map<string, ContentNode>,
  resources: Map<string, string> = new Map()
): void {
  doc.transact(() => {
    doc.getMap("meta").set("mode", "local");
    visitBody(doc, getBody(doc), node => {
      const attributes = node.getAttributes() as Record<string, unknown>;
      const collabId = typeof attributes.collabId === "string" ? attributes.collabId : "";
      if (attributes.type === "collaboration-placeholder" && privateNodes.has(collabId)) {
        const restored = prepareNodes(doc, [{ ...privateNodes.get(collabId)!, collabId }])[0];
        return { replaceWith: embedFor(restored) };
      }
      for (const key of Object.keys(attributes))
        rewriteAttribute(node, key, attributes[key], resources);
      return {};
    });
    rewriteFields(doc, resources);
    const meta = doc.getMap("meta");
    const banner = meta.get("bannerBg");
    if (typeof banner === "string" && resources.has(banner))
      meta.set("bannerBg", resources.get(banner));
  }, UPGRADE_ORIGIN);
}

/** 深度遍历正文里的元素节点；回调返回 replaceWith 时用它替换该节点（不再深入） */
function visitBody(
  doc: Y.Doc,
  container: Y.XmlText,
  visit: (node: Y.XmlText) => { replaceWith?: Y.XmlText }
) {
  const replacements: { offset: number; node: Y.XmlText }[] = [];
  let offset = 0;
  for (const part of container.toDelta() as { insert: unknown }[]) {
    if (part.insert instanceof Y.XmlText) {
      const result = visit(part.insert);
      if (result.replaceWith) replacements.push({ offset, node: result.replaceWith });
      else visitBody(doc, part.insert, visit);
      offset += 1;
    } else offset += String(part.insert).length;
  }
  // 倒序替换，前面的替换不会挪动后面的偏移
  for (const replacement of replacements.reverse()) {
    container.delete(replacement.offset, 1);
    container.insertEmbed(replacement.offset, replacement.node);
  }
}

function placeholder(collabId: string, label: string): Y.XmlText {
  const node = new Y.XmlText();
  node.setAttribute("type", "collaboration-placeholder");
  node.setAttribute("collabId", collabId);
  node.setAttribute("label", label);
  node.insert(0, "", { type: "formatted" });
  return node;
}

function embedFor(node: ContentNode): Y.XmlText {
  const [entry] = slateNodesToInsertDelta([node as unknown as Descendant]) as {
    insert: Y.XmlText;
  }[];
  return entry.insert;
}

/** 元素属性里的资源引用改写（属性值可能是嵌套结构，如图集的 images 数组） */
function rewriteAttribute(
  node: Y.XmlText,
  key: string,
  value: unknown,
  resources: Map<string, string>
) {
  if (!resources.size) return;
  const next = rewriteResources(value, resources, key);
  if (next !== value) node.setAttribute(key, next as never);
}

/** 块字段（源码文本、chart 的 data/config 等）里的资源引用改写 */
function rewriteFields(doc: Y.Doc, resources: Map<string, string>) {
  if (!resources.size) return;
  for (const [, fields] of getFields(doc)) {
    if (!(fields instanceof Y.Map)) continue;
    for (const [key, value] of fields) {
      const json = value instanceof Y.AbstractType ? value.toJSON() : value;
      const next = rewriteResources(json, resources, key);
      if (next !== json) setSharedValue(fields, key, next);
    }
  }
}

function rewriteResources(value: unknown, resources: Map<string, string>, key?: string): unknown {
  if (typeof value === "string")
    return key && RESOURCE_FIELDS.has(key) ? (resources.get(value) ?? value) : value;
  if (Array.isArray(value)) {
    const next = value.map(entry => rewriteResources(entry, resources, key));
    return next.some((entry, index) => entry !== value[index]) ? next : value;
  }
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    if (PRIVATE_BLOCKS.has(String(source.type))) return value;
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [name, entry] of Object.entries(source)) {
      next[name] = rewriteResources(entry, resources, name);
      changed ||= next[name] !== entry;
    }
    return changed ? next : value;
  }
  return value;
}
