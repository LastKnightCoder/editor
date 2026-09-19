import * as Y from "yjs";
import diff from "fast-diff";
import { slateNodesToInsertDelta, yTextToSlateElement } from "@slate-yjs/core";
import type { Descendant } from "slate";
import {
  ASSET_PREFIX,
  CollaborationError,
  COLLABORATION_VERSION,
  type ContentNode,
  type SharedContent,
} from "./protocol";
import { migrateTabsToPanes } from "./tabs-normalize";

export const SOURCE_FIELDS: Record<string, string[]> = {
  "code-block": ["code"],
  "inline-math": ["tex"],
  "block-math": ["tex"],
  mermaid: ["chart"],
  plantuml: ["content"],
  abc: ["content"],
  graphviz: ["dot"],
  "html-block": ["html"],
  "html-inline": ["html"],
  "custom-block": ["content"],
  // tikz/typst 渲染组件读取 content，候选顺序保持一致，避免编辑写入 code 而预览读 content。
  tikz: ["content", "code"],
  typst: ["content", "code"],
  "front-matter": ["content", "value"],
};
// content-link 的节点数据（链接文字与引用元信息）随文档共享，仅 hover 预览依赖本机数据；
// 其余本地实体块整体剥离为占位符，原始数据保存在创建者设备。
export const PRIVATE_BLOCKS = new Set([
  "whiteboard",
  "database",
  "question",
  "question-card",
  "project-card-list",
]);
export const LOCAL_FIELDS = new Set(["activeKey", "isFold", "compiledFrom", "compiledAt", "svg"]);
export const RESOURCE_FIELDS = new Set([
  "url",
  "src",
  "filePath",
  "poster",
  "bannerBg",
  "previewUrl",
]);

export const getBody = (doc: Y.Doc) => doc.get("content", Y.XmlText);
export const getFields = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>("fields");
export const emptyContent = (): ContentNode[] => [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] },
];

// 与键序无关的深比较：Y 类型的 toJSON 键序与对象字面量不同，不能用 JSON.stringify 直接对比。
export function sharedValueEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const value = (input: unknown) => (input instanceof Y.AbstractType ? input.toJSON() : input);
  const left = value(a);
  const right = value(b);
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length &&
      left.every((entry, index) => sharedValueEquals(entry, right[index]))
    );
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every(
        key =>
          key in right &&
          sharedValueEquals(
            (left as Record<string, unknown>)[key],
            (right as Record<string, unknown>)[key]
          )
      )
    );
  }
  return false;
}

export function replaceText(text: Y.Text, value: string) {
  let offset = 0;
  for (const [operation, part] of diff(text.toString(), value)) {
    if (operation === -1) text.delete(offset, part.length);
    else if (operation === 1) {
      text.insert(offset, part);
      offset += part.length;
    } else offset += part.length;
  }
}

export function getBlockFields(doc: Y.Doc, id: string): Y.Map<unknown> {
  const fields = getFields(doc);
  let block = fields.get(id);
  if (!block) {
    block = new Y.Map();
    fields.set(id, block);
  }
  return block;
}

export function getSourceText(doc: Y.Doc, id: string, field: string): Y.Text {
  const block = getBlockFields(doc, id);
  let text = block.get(field);
  if (!(text instanceof Y.Text)) {
    text = new Y.Text();
    block.set(field, text);
  }
  return text as Y.Text;
}

export function setSharedValue(map: Y.Map<unknown>, key: string, value: unknown): void {
  const previous = map.get(key);
  if (typeof value === "string") {
    const text = previous instanceof Y.Text ? previous : new Y.Text();
    if (text !== previous) map.set(key, text);
    replaceText(text, value);
  } else if (Array.isArray(value)) {
    const array = previous instanceof Y.Array ? previous : new Y.Array();
    if (array !== previous) map.set(key, array);
    const sharedLength = Math.min(array.length, value.length);
    for (let index = 0; index < sharedLength; index++) {
      const current = array.get(index);
      if (
        current instanceof Y.Map &&
        value[index] &&
        typeof value[index] === "object" &&
        !Array.isArray(value[index])
      ) {
        updateSharedObject(current, value[index] as Record<string, unknown>);
      } else if (!sharedValueEquals(current, value[index])) {
        array.delete(index, 1);
        array.insert(index, [toSharedValue(value[index])]);
      }
    }
    if (array.length > value.length) array.delete(value.length, array.length - value.length);
    if (value.length > sharedLength)
      array.insert(sharedLength, value.slice(sharedLength).map(toSharedValue));
  } else if (value && typeof value === "object") {
    const object = previous instanceof Y.Map ? previous : new Y.Map();
    if (object !== previous) map.set(key, object);
    updateSharedObject(object, value as Record<string, unknown>);
  } else if (previous !== value) map.set(key, value ?? null);
}

function toSharedValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const array = new Y.Array();
    array.insert(0, value.map(toSharedValue));
    return array;
  }
  if (value && typeof value === "object") {
    const map = new Y.Map();
    for (const [key, entry] of Object.entries(value)) map.set(key, toSharedValue(entry));
    return map;
  }
  return value;
}

function updateSharedObject(map: Y.Map<unknown>, value: Record<string, unknown>) {
  for (const key of map.keys()) if (!(key in value)) map.delete(key);
  for (const [key, entry] of Object.entries(value)) setSharedValue(map, key, entry);
}

export function sharedProperty(type: string, key: string) {
  return (
    SOURCE_FIELDS[type]?.includes(key) ||
    (type === "chart" && ["data", "config"].includes(key)) ||
    (type === "code-block" && key === "magicMove")
  );
}

export function prepareNodes(
  doc: Y.Doc,
  nodes: ContentNode[],
  privateNodes?: Map<string, ContentNode>,
  newIds = false
): ContentNode[] {
  return nodes.map(input => {
    if (typeof input.text === "string" && !input.children) return { ...input, type: "formatted" };
    const id = !newIds && typeof input.collabId === "string" ? input.collabId : crypto.randomUUID();
    const local = doc.getMap("meta").get("mode") === "local";
    if (!local && PRIVATE_BLOCKS.has(input.type || "")) {
      privateNodes?.set(id, structuredClone(input));
      return {
        type: "collaboration-placeholder",
        collabId: id,
        label: input.type,
        children: [{ type: "formatted", text: "" }],
      };
    }
    const node: ContentNode = { ...input, collabId: id };
    for (const key of Object.keys(node)) {
      if (LOCAL_FIELDS.has(key)) {
        if (!local) delete node[key];
      } else if (sharedProperty(node.type || "", key)) {
        setSharedValue(getBlockFields(doc, id), key, node[key]);
        delete node[key];
      }
    }
    node.children = prepareNodes(
      doc,
      input.children?.length ? input.children : [{ type: "formatted", text: "" }],
      privateNodes,
      newIds
    );
    return node;
  });
}

const UNSAFE_KEYS = ["__proto__", "constructor", "prototype"];

export function materializeNodes(
  doc: Y.Doc,
  nodes: ContentNode[],
  privateNodes?: Map<string, ContentNode>,
  activeKeyOverrides?: Map<string, string>
): ContentNode[] {
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
    if (input.children)
      node.children = materializeNodes(doc, input.children, privateNodes, activeKeyOverrides);
    // activeKey 是本机视图状态不进 Yjs，落库投影时优先取上报的视图激活，
    // 失效时兜底为第一个 pane，保证 tabs 节点始终持有合法激活 key。
    if (node.type === "tabs") {
      const panes = (node.children || []).filter(
        child => child && typeof child === "object" && child.type === "tab-pane"
      ) as { tabKey?: string }[];
      const isValid = (key: unknown) => panes.some(pane => pane.tabKey === key);
      const override = activeKeyOverrides?.get(id);
      if (override !== undefined && isValid(override)) node.activeKey = override;
      else if (!isValid(node.activeKey)) node.activeKey = panes[0]?.tabKey;
    }
    return node;
  });
}

/**
 * 存量协作缓存结构转换：旧版本把 tabs 内容外置在块字段（tabOrder + tabs Y.Map），
 * 在同一 Y.Doc 内整体重建正文为 tab-pane 树内形态并清理块字段。幂等：无旧块字段时不动。
 * 返回是否发生了转换。
 */
export function migrateTabsBlocksInDoc(
  doc: Y.Doc,
  privateNodes?: Map<string, ContentNode>
): boolean {
  const fields = getFields(doc);
  const legacyBlockIds: string[] = [];
  for (const [id, block] of fields.entries()) {
    if (block instanceof Y.Map && (block.has("tabs") || block.has("tabOrder")))
      legacyBlockIds.push(id);
  }
  if (legacyBlockIds.length === 0) return false;

  // 块字段中的旧 Tab 内容（title + Y.XmlText 内容）按 collabId 收集
  const legacyTabs = new Map<string, { key: string; title: string; content: ContentNode[] }[]>();
  for (const id of legacyBlockIds) {
    const block = fields.get(id) as Y.Map<unknown>;
    const order = block.get("tabOrder") as Y.Array<string> | undefined;
    const tabs = block.get("tabs") as Y.Map<Y.Map<unknown>> | undefined;
    const entries = [...new Set(order?.toArray() || [])].flatMap(key => {
      const tab = tabs?.get(key);
      const root = tab?.get("content");
      if (!(root instanceof Y.XmlText)) return [];
      return [
        {
          key,
          title: String(tab?.get("title") || ""),
          content: materializeNodes(
            doc,
            yTextToSlateElement(root).children as ContentNode[],
            privateNodes
          ),
        },
      ];
    });
    legacyTabs.set(id, entries);
  }

  // 物化正文后把旧 Tab 内容补回 tabs 节点，再走统一的 JSON 迁移
  const article = readSharedContent(doc, privateNodes);
  const injectedIds = new Set<string>();
  const injectLegacyTabs = (nodes: ContentNode[]): ContentNode[] =>
    nodes.map(node => {
      if (typeof node.text === "string" || !Array.isArray(node.children)) return node;
      const next: ContentNode = { ...node, children: injectLegacyTabs(node.children) };
      if (next.type === "tabs" && legacyTabs.has(String(next.collabId))) {
        const entries = legacyTabs.get(String(next.collabId))!;
        injectedIds.add(String(next.collabId));
        return {
          ...next,
          activeKey: next.activeKey ?? entries[0]?.key,
          tabsContent: entries,
        };
      }
      return next;
    });
  const injected = injectLegacyTabs(article.content);
  // 树中找不到对应 tabs 节点时不清理块字段，避免内容随块字段一起丢失
  const removableIds = legacyBlockIds.filter(id => injectedIds.has(id));
  if (removableIds.length === 0) return false;
  const { content: migrated } = migrateTabsToPanes(injected);

  doc.transact(() => {
    const body = getBody(doc);
    body.delete(0, body.length);
    body.applyDelta(
      slateNodesToInsertDelta(prepareNodes(doc, migrated, privateNodes) as Descendant[])
    );
    for (const id of removableIds) {
      const block = fields.get(id) as Y.Map<unknown> | undefined;
      block?.delete("tabs");
      block?.delete("tabOrder");
    }
  });
  return true;
}

export function createSharedDocument(
  article: SharedContent,
  privateNodes?: Map<string, ContentNode>,
  mode: "local" | "shared" = "shared"
): Y.Doc {
  const doc = new Y.Doc();
  // 旧数据（tabsContent 形态）进 Yjs 树前统一迁移为 tab-pane 子节点形态
  const { content } = migrateTabsToPanes(article.content.length ? article.content : emptyContent());
  doc.transact(() => {
    doc.getMap("meta").set("version", COLLABORATION_VERSION);
    doc.getMap("meta").set("mode", mode);
    replaceText(doc.getText("title"), article.title);
    doc.getMap("meta").set("bannerBg", article.bannerBg || "");
    doc.getMap("meta").set("bannerPosition", article.bannerPosition || "center");
    getBody(doc).applyDelta(
      slateNodesToInsertDelta(prepareNodes(doc, content, privateNodes) as Descendant[])
    );
  });
  return doc;
}

/** 用本地内容整树替换共享文档正文（CRDT 语义：整段删除后重新插入，远端看到一次替换
 *  而非静默覆盖状态）。用于作者在协作不可用期间本地编辑、重连时选择「保留本机」的推回路径；
 *  标题不在此列——房间标题由各业务表管理，投影通道只回写正文。 */
export function replaceSharedContent(
  doc: Y.Doc,
  content: ContentNode[],
  privateNodes?: Map<string, ContentNode>
): void {
  const migrated = migrateTabsToPanes(content.length ? content : emptyContent()).content;
  doc.transact(() => {
    const body = getBody(doc);
    body.delete(0, body.length);
    body.applyDelta(
      slateNodesToInsertDelta(prepareNodes(doc, migrated, privateNodes) as Descendant[])
    );
  });
}

export function readSharedContent(
  doc: Y.Doc,
  privateNodes?: Map<string, ContentNode>,
  activeKeyOverrides?: Map<string, string>
): SharedContent {
  return {
    title: doc.getText("title").toString(),
    bannerBg: String(doc.getMap("meta").get("bannerBg") || ""),
    bannerPosition: String(doc.getMap("meta").get("bannerPosition") || "center"),
    content: materializeNodes(
      doc,
      yTextToSlateElement(getBody(doc)).children as ContentNode[],
      privateNodes,
      activeKeyOverrides
    ),
  };
}

const httpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
    );
  } catch {
    return false;
  }
};

export function isSafeResource(value: string, field = ""): boolean {
  if (!value || value.startsWith(ASSET_PREFIX)) return true;
  // bannerBg 可以是颜色或 CSS 渐变；带协议头的值（file:、https: 等）必须是 http(s)，
  // 其余情况只校验其中 url(...) 引用的地址。
  if (field === "bannerBg") {
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return httpUrl(value);
    const references = (value.match(/url\(\s*['"]?[^'")]+['"]?\s*\)/g) || []) as string[];
    return references.every(reference =>
      httpUrl(reference.replace(/url\(\s*['"]?/, "").replace(/['"]?\s*\)$/, ""))
    );
  }
  return httpUrl(value);
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
  let count = 0;
  const visit = (value: unknown, depth: number, key = "") => {
    if (depth > 64 || ++count > 150000)
      throw new CollaborationError("INVALID_CONTENT", "文档结构超过限制");
    if (typeof value === "string") {
      if (RESOURCE_FIELDS.has(key) && !isSafeResource(value, key))
        throw new CollaborationError("INVALID_CONTENT", "共享内容不能包含本地路径或私有资源地址");
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(entry => visit(entry, depth + 1));
      return;
    }
    if (value && typeof value === "object") {
      const object = value as Record<string, unknown>;
      if (PRIVATE_BLOCKS.has(String(object.type || "")))
        throw new CollaborationError("INVALID_CONTENT", "不支持共享本地实体块");
      for (const [name, entry] of Object.entries(object)) {
        if (UNSAFE_KEYS.includes(name))
          throw new CollaborationError("INVALID_CONTENT", "文档包含无效属性");
        visit(entry, depth + 1, name);
      }
    }
  };
  visit(article, 0);
  return article;
}
