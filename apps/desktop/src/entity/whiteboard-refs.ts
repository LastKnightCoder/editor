/**
 * 白板对笔记的使用：从白板页画布（white_board_contents.data 的 JSON）按元素类型提取，
 * 以及从文档正文里提取嵌入的白板块。纯函数，主进程（白板引用索引）与测试共用。
 *
 * 只认白板元素的字段（卡片元素的 cardId、文本块的 contentId / linkedCardId / linkedArticleId、
 * 思维导图节点关联的笔记、通用的 entityRef），不做通用 JSON 扫描：Slate 正文里的 content-link
 * 也带 contentId，通用扫描会误判。白板元素的 children 只装白板元素（框架、分栏、思维导图子节点），
 * Slate 正文在 text / content 字段里，元素文字中的内联引用经 extractInlineRefs 单独取。
 *
 * 接入约定（新增「指向笔记」的白板元素时必须遵守，见 03 架构指南「脉络」）：
 * - 元素指向一个正文实体（卡片、文章、项目文档、日记）时，在元素上存 `entityRef: { kind, id }`
 *   （kind 用 EntityRefKind 的写法），这里已通用识别，无需改代码；
 * - 元素直接持有一份正文（像文本块那样）时存 `contentId`，并在下面的 switch 里为该类型加一个 case；
 * - 元素的 Slate 正文放在 `text` 字段才会被扫内联引用，放别的字段需要在这里显式处理；
 * - 改动这里的解析规则后，必须把 whiteboard-indexer 的 WHITEBOARD_REF_VERSION 加一，
 *   否则已索引的页不会重解析；
 * - 「从白板元素转为卡片 / 文章」若是共用正文（投影）不记谱系，若复制出新正文则记谱系 derived
 *   （src 为白板页无法表达时，先在 docs/knowledge-loop/04 记决策再扩 LineageNode）。
 */

import { extractInlineRefs } from "./inline-refs";
import { normalizeEntityRefKind } from "./ref";

export type WhiteboardRefKind = "card" | "article" | "project-item" | "diary" | "content";

/**
 * card：卡片元素；richtext：文本块；mind-node：思维导图节点关联的笔记；
 * entity：元素的通用 entityRef；inline：元素文字里的内联引用
 */
export type WhiteboardRefVia = "card" | "richtext" | "mind-node" | "entity" | "inline";

export interface WhiteboardRef {
  dstKind: WhiteboardRefKind;
  dstId: number;
  via: WhiteboardRefVia;
}

interface BoardNode {
  type?: unknown;
  children?: unknown;
  text?: unknown;
  cardId?: unknown;
  contentId?: unknown;
  linkedCardId?: unknown;
  linkedArticleId?: unknown;
  entityRef?: { kind?: unknown; id?: unknown };
}

const asNode = (value: unknown): BoardNode | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as BoardNode) : null;

const positiveId = (value: unknown): number | null => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const refKey = (ref: WhiteboardRef) => `${ref.dstKind}:${ref.dstId}:${ref.via}`;

/** 一页画布用到的笔记，去重；data 可以是解析后的对象或 JSON 字符串 */
export function extractWhiteboardRefs(data: unknown): WhiteboardRef[] {
  const root = asNode(typeof data === "string" ? safeParse(data) : data);
  const refs = new Map<string, WhiteboardRef>();
  const add = (dstKind: WhiteboardRefKind, raw: unknown, via: WhiteboardRefVia) => {
    const dstId = positiveId(raw);
    if (dstId === null) return;
    const ref = { dstKind, dstId, via };
    refs.set(refKey(ref), ref);
  };

  const visit = (value: unknown) => {
    const node = asNode(value);
    if (!node) return;
    switch (node.type) {
      case "card":
        add("card", node.cardId, "card");
        break;
      case "richtext":
        add("content", node.contentId, "richtext");
        add("card", node.linkedCardId, "richtext");
        add("article", node.linkedArticleId, "richtext");
        break;
      case "mind-node":
        add("content", node.contentId, "mind-node");
        break;
    }
    const entityKind = normalizeEntityRefKind(node.entityRef?.kind);
    if (entityKind) add(entityKind, node.entityRef?.id, "entity");
    if (Array.isArray(node.text)) {
      for (const inline of extractInlineRefs(node.text)) {
        add(inline.dst.kind, inline.dst.id, "inline");
        add("content", inline.dstContentId, "inline");
      }
    }
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };

  if (root && Array.isArray(root.children)) root.children.forEach(visit);
  return [...refs.values()];
}

interface SlateNode {
  type?: unknown;
  whiteBoardContentId?: unknown;
  children?: unknown;
}

/** 文档正文里嵌入的白板块指向的白板页 id，去重 */
export function extractWhiteboardEmbeds(content: unknown): number[] {
  const pages = new Set<number>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value && typeof value === "object" ? (value as SlateNode) : null;
    if (!node) return;
    if (node.type === "whiteboard") {
      const pageId = positiveId(node.whiteBoardContentId);
      if (pageId !== null) pages.add(pageId);
    }
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };
  visit(content);
  return [...pages];
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
