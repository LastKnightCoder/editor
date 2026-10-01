/**
 * 从 Slate 正文（contents.content 的 JSON）提取内联引用（content-link 节点）。
 *
 * 纯函数，主进程（引用索引、知识地图）与渲染端共用；不依赖编辑器扩展模块，
 * 只按节点的 JSON 形状判断。content-link 是行内节点，总被包在某个块里（段落、列表项、
 * 表格单元等），片段取这个直接父块的纯文本。
 */

import { normalizeEntityRefKind, type EntityRef } from "./ref";

/** 片段在链接两侧各保留的最大字数 */
const CONTEXT_CHARS = 70;

export interface InlineRefSnippet {
  before: string;
  /** 链接在正文里显示的文字（content-link 的 contentTitle） */
  label: string;
  after: string;
}

export interface InlineRef {
  dst: EntityRef;
  /** content-link 记录的目标正文 id；老节点可能缺失 */
  dstContentId: number | null;
  snippet: InlineRefSnippet;
}

interface JsonNode {
  type?: unknown;
  text?: unknown;
  children?: unknown;
  refId?: unknown;
  contentId?: unknown;
  contentType?: unknown;
  contentTitle?: unknown;
}

const asNode = (value: unknown): JsonNode | null =>
  value && typeof value === "object" ? (value as JsonNode) : null;

const childrenOf = (node: JsonNode): unknown[] =>
  Array.isArray(node.children) ? node.children : [];

const isContentLink = (node: JsonNode) => node.type === "content-link";

/** 链接文字：contentTitle 优先；为空（存量节点常见）时用节点里显示的文字 */
const linkLabel = (node: JsonNode): string =>
  typeof node.contentTitle === "string" && node.contentTitle.trim()
    ? node.contentTitle
    : childrenText(node);

const childrenText = (node: JsonNode): string =>
  childrenOf(node)
    .map(child => {
      const c = asNode(child);
      return c ? plainText(c) : "";
    })
    .join("");

/** 节点的纯文本；嵌套的 content-link 用其标题代入 */
function plainText(node: JsonNode): string {
  if (typeof node.text === "string") return node.text;
  return childrenOf(node)
    .map(child => {
      const c = asNode(child);
      if (!c) return "";
      return isContentLink(c) ? linkLabel(c) : plainText(c);
    })
    .join("");
}

const collapse = (text: string) => text.replace(/\s+/g, " ");

function clipBefore(text: string): string {
  const t = collapse(text).trimStart();
  return t.length > CONTEXT_CHARS ? `…${t.slice(t.length - CONTEXT_CHARS)}` : t;
}

function clipAfter(text: string): string {
  const t = collapse(text).trimEnd();
  return t.length > CONTEXT_CHARS ? `${t.slice(0, CONTEXT_CHARS)}…` : t;
}

/**
 * 一个块的直接行内子节点里出现的引用（嵌套的子块交给递归处理）。
 * 引用独占一块、前后都没有文字时（如列表项里只放一个链接），以文档里上一个有文字的块作前文。
 */
function refsInBlock(
  block: JsonNode,
  out: InlineRef[],
  seen: Set<string>,
  previousText: string
) {
  const inline = childrenOf(block).map(asNode);
  const texts = inline.map(c => (!c ? "" : isContentLink(c) ? linkLabel(c) : plainText(c)));
  inline.forEach((child, index) => {
    if (!child || !isContentLink(child)) return;
    const kind = normalizeEntityRefKind(child.contentType);
    if (!kind || typeof child.refId !== "number") return;
    // 同一块里对同一目标的重复引用只算一次
    const dedupeKey = `${kind}:${child.refId}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    const before = clipBefore(texts.slice(0, index).join(""));
    const after = clipAfter(texts.slice(index + 1).join(""));
    out.push({
      dst: { kind, id: child.refId },
      dstContentId: typeof child.contentId === "number" ? child.contentId : null,
      snippet: {
        before: before || after ? before : clipBefore(previousText),
        label: texts[index],
        after,
      },
    });
  });
}

export function extractInlineRefs(content: unknown): InlineRef[] {
  const out: InlineRef[] = [];
  // 文档顺序里上一个有自己文字的文本块（直接含文字叶子、且不只是链接）的纯文本
  let previousText = "";
  const walk = (value: unknown) => {
    const node = asNode(value);
    if (!node || isContentLink(node)) return;
    const children = childrenOf(node);
    if (children.length === 0) return;
    refsInBlock(node, out, new Set(), previousText);
    const isTextBlock = children.some(child => typeof asNode(child)?.text === "string");
    if (isTextBlock) {
      // 只含链接的块不算：列表里一串链接都以它们上方的文字作前文
      const ownText = children
        .map(asNode)
        .map(child => (child && !isContentLink(child) ? plainText(child) : ""))
        .join("");
      if (collapse(ownText).trim()) previousText = collapse(plainText(node)).trim();
    }
    children.forEach(walk);
  };
  if (Array.isArray(content)) content.forEach(walk);
  return out;
}

/** Slate 正文的纯文本（块之间以空格分隔，空白折叠），供标题、摘要等展示 */
export function slatePlainText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return collapse(
    content
      .map(value => {
        const node = asNode(value);
        return node ? plainText(node) : "";
      })
      .join(" ")
  ).trim();
}

/** 正文内联引用到的卡片 id（按出现顺序，含重复），供卡片链接与知识地图使用 */
export function inlineCardIds(content: unknown): number[] {
  const ids: number[] = [];
  const walk = (value: unknown) => {
    const node = asNode(value);
    if (!node) return;
    if (isContentLink(node)) {
      if (node.contentType === "card" && typeof node.refId === "number") ids.push(node.refId);
      return;
    }
    childrenOf(node).forEach(walk);
  };
  if (Array.isArray(content)) content.forEach(walk);
  return ids;
}
