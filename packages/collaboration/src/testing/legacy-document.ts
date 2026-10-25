// 仅生成历史升级测试输入，不作为应用运行时的文档写入 API。
import * as Y from "yjs";
import { slateNodesToInsertDelta } from "@slate-yjs/core";
import type { Descendant } from "slate";
import { COLLABORATION_VERSION, type ContentNode, type SharedContent } from "../protocol";
import { getBody, getFields, emptyContent, assertLegacyDocument } from "../legacy-document";
import { replaceText, setSharedValue } from "../shared-values";
export const SOURCE_FIELDS: Record<string, string[]> = {
  "code-block": ["code"],
  "inline-math": ["tex"],
  "block-math": ["tex"],
  mermaid: ["chart"],
  plantuml: ["content"],
  abc: ["content"],
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
export const PRIVATE_BLOCKS = new Set(["whiteboard", "database", "project-card-list"]);
export const LOCAL_FIELDS = new Set(["activeKey", "isFold", "compiledFrom", "compiledAt", "svg"]);

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

export function sharedProperty(type: string, key: string) {
  return SOURCE_FIELDS[type]?.includes(key) || (type === "code-block" && key === "magicMove");
}

export function prepareNodes(
  doc: Y.Doc,
  nodes: ContentNode[],
  privateNodes?: Map<string, ContentNode>,
  newIds = false
): ContentNode[] {
  assertLegacyDocument(doc);
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

export function createSharedDocument(
  article: SharedContent,
  privateNodes?: Map<string, ContentNode>,
  mode: "local" | "shared" = "shared"
): Y.Doc {
  const doc = new Y.Doc();
  const content = article.content.length ? article.content : emptyContent();
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
  doc.transact(() => {
    const body = getBody(doc);
    body.delete(0, body.length);
    body.applyDelta(
      slateNodesToInsertDelta(
        prepareNodes(doc, content.length ? content : emptyContent(), privateNodes) as Descendant[]
      )
    );
  });
}
