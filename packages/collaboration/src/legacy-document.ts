// 仅在升级入口解码旧协议；当前编辑和协作写入使用契约文档。
import { isSafeResource } from "./resource-policy";
import { assertLegacyDocument } from "./document-version";
export { assertLegacyDocument } from "./document-version";
export { isSafeResource } from "./resource-policy";
import * as Y from "yjs";
export { replaceText, setSharedValue, sharedValueEquals } from "./shared-values";
import { slateNodesToInsertDelta, yTextToSlateElement } from "@slate-yjs/core";
import type { Descendant } from "slate";
import {
  CollaborationError,
  COLLABORATION_VERSION,
  type ContentNode,
  type SharedContent,
} from "./protocol";
import { readDocumentResources } from "./resources";
import { contentResourceValues, forEachContentResource } from "@tau/db-schema/content-resources";

const LEGACY_PRIVATE_TYPES = new Set(["whiteboard", "database", "project-card-list"]);

export const getBody = (doc: Y.Doc) => {
  assertLegacyDocument(doc);
  return doc.get("content", Y.XmlText);
};
export const getFields = (doc: Y.Doc) => {
  assertLegacyDocument(doc);
  return doc.getMap<Y.Map<unknown>>("fields");
};

export const emptyContent = (): ContentNode[] => [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] },
];

const UNSAFE_KEYS = ["__proto__", "constructor", "prototype"];

export function materializeNodes(
  doc: Y.Doc,
  nodes: ContentNode[],
  privateNodes?: ReadonlyMap<string, ContentNode>
): ContentNode[] {
  assertLegacyDocument(doc);
  return nodes.map(input => {
    // Yjs 不保留空文本的属性，还原时必须恢复项目要求的文本类型。
    if (typeof input.text === "string" && !input.children) return { ...input, type: "formatted" };
    const id = typeof input.collabId === "string" ? input.collabId : "";
    if (input.type === "collaboration-placeholder" && privateNodes?.has(id))
      return { ...structuredClone(privateNodes.get(id)!), collabId: id };
    const node = { ...input };
    const block = getFields(doc).get(id);
    if (block) {
      for (const [key, value] of block) {
        if (key !== "tabs" && key !== "tabOrder" && !UNSAFE_KEYS.includes(key))
          node[key] = value instanceof Y.AbstractType ? value.toJSON() : value;
      }
    }
    if (input.children) node.children = materializeNodes(doc, input.children, privateNodes);
    return node;
  });
}

/** 把未转换的主库 JSON 放入只读迁移快照；不拆字段、不剥离节点、不改业务属性。 */
export function createLegacySnapshot(article: SharedContent): Y.Doc {
  const doc = new Y.Doc({ gc: false });
  doc.transact(() => {
    const meta = doc.getMap("meta");
    meta.set("version", COLLABORATION_VERSION);
    meta.set("mode", "local");
    meta.set("bannerBg", article.bannerBg || "");
    meta.set("bannerPosition", article.bannerPosition || "center");
    doc.getText("title").insert(0, article.title);
    getBody(doc).applyDelta(
      slateNodesToInsertDelta(
        (article.content.length ? article.content : emptyContent()) as Descendant[]
      )
    );
  });
  return doc;
}

export function readSharedContent(
  doc: Y.Doc,
  privateNodes?: ReadonlyMap<string, ContentNode>
): SharedContent {
  assertLegacyDocument(doc);
  return {
    title: doc.getText("title").toString(),
    bannerBg: String(doc.getMap("meta").get("bannerBg") || ""),
    bannerPosition: String(doc.getMap("meta").get("bannerPosition") || "center"),
    content: materializeNodes(
      doc,
      (getBody(doc).length
        ? yTextToSlateElement(getBody(doc)).children
        : emptyContent()) as ContentNode[],
      privateNodes
    ),
  };
}

// 内容校验失败属于客户端问题（INVALID_CONTENT），抛 CollaborationError 以 4xx 透传原因，
// 避免被服务端 5xx 兜底成"服务器暂时无法完成请求"。
export function validateDocument(doc: Y.Doc, maxBytes = 8 * 1024 * 1024) {
  if (doc.getMap("meta").get("mode") === "local")
    throw new CollaborationError("INVALID_CONTENT", "本机会话不能直接上传");
  if (doc.getMap("meta").get("version") !== COLLABORATION_VERSION)
    throw new CollaborationError("INVALID_CONTENT", "协作文档版本不兼容，请升级 Tau");
  if (Y.encodeStateAsUpdate(doc).byteLength > maxBytes)
    throw new CollaborationError("INVALID_CONTENT", "协作文档超过大小限制");
  const article = readSharedContent(doc);
  if (article.title.length > 500) throw new CollaborationError("INVALID_CONTENT", "共享名称过长");
  const unsafe = () =>
    new CollaborationError("INVALID_CONTENT", "共享内容不能包含本地路径或私有资源地址");
  if (!isSafeResource(article.bannerBg, "bannerBg")) throw unsafe();
  let count = 0;
  const visit = (value: unknown, depth: number) => {
    if (depth > 64 || ++count > 150000)
      throw new CollaborationError("INVALID_CONTENT", "文档结构超过限制");
    if (typeof value === "string") return;
    if (Array.isArray(value)) {
      value.forEach(entry => visit(entry, depth + 1));
      return;
    }
    if (value && typeof value === "object") {
      const object = value as Record<string, unknown>;
      if (LEGACY_PRIVATE_TYPES.has(String(object.type || "")))
        throw new CollaborationError("INVALID_CONTENT", "不支持共享本地实体块");
      for (const [name, entry] of Object.entries(object)) {
        if (UNSAFE_KEYS.includes(name))
          throw new CollaborationError("INVALID_CONTENT", "文档包含无效属性");
        visit(entry, depth + 1);
      }
    }
  };
  visit(article, 0);
  // 资源只按文档携带的声明检查：未声明的字段原样同步，由节点的声明方负责
  forEachContentResource(article.content, readDocumentResources(doc, true), ({ slot }) => {
    for (const value of contentResourceValues(slot)) if (!isSafeResource(value)) throw unsafe();
  });
  return article;
}

export function collectSharedResources(doc: Y.Doc): string[] {
  const references = new Set<string>();
  const content = (
    getBody(doc).length ? yTextToSlateElement(getBody(doc)).children : []
  ) as ContentNode[];
  forEachContentResource(materializeNodes(doc, content), readDocumentResources(doc), ({ slot }) => {
    for (const value of contentResourceValues(slot)) references.add(value);
  });
  const banner = doc.getMap("meta").get("bannerBg");
  if (typeof banner === "string" && banner) references.add(banner);
  return [...references];
}
