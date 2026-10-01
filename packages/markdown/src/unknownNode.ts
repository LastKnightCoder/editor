/**
 * 未知节点的 Markdown 兜底语法（ER-006 / ER-P3）：没有 codec 的元素整节点原样存成 JSON，导入时还原。
 *
 * - 块级：`:::tau-node{type="x"}` 容器包一段 json 代码围栏，围栏里是整个节点（含 children）。
 * - 行内：`:tau-node[正文]{type="x" json="…"}`，方括号里的正文只供阅读，还原以 json 为准。
 *
 * 块级 / 行内按 Slate 的结构判断：父元素含文本子节点时，它的元素子节点必然是行内的。
 */
import type { Descendant } from "slate";

export const UNKNOWN_NODE_DIRECTIVE = "tau-node";

type NodeLike = { type?: string; text?: string; children?: NodeLike[] };

/** 该位置上的元素是否是行内的（父元素含文本子节点） */
export const isInlinePosition = (parent: NodeLike | null | undefined): boolean =>
  !!parent?.children?.some(child => typeof child.text === "string");

const plainText = (node: NodeLike): string =>
  typeof node.text === "string" ? node.text : (node.children ?? []).map(plainText).join("");

const escapeAttribute = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/\\/g, "&#92;").replace(/"/g, "&quot;");

const escapeLabel = (value: string): string =>
  value.replace(/[\r\n\u2028\u2029]+/g, " ").replace(/[\\[\]]/g, match => `\\${match}`);

/** 围栏长度必须超过内容里最长的反引号串，否则 JSON 里的 ``` 会提前闭合围栏 */
const fenceFor = (content: string): string => {
  const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map(run => run.length));
  return "`".repeat(Math.max(3, longest + 1));
};

export const serializeUnknownBlock = (element: NodeLike): string => {
  const json = JSON.stringify(element);
  const fence = fenceFor(json);
  const type = escapeAttribute(String(element.type));
  return `:::${UNKNOWN_NODE_DIRECTIVE}{type="${type}"}\n${fence}json\n${json}\n${fence}\n:::`;
};

export const serializeUnknownInline = (element: NodeLike): string => {
  const type = escapeAttribute(String(element.type));
  const json = escapeAttribute(JSON.stringify(element));
  return `:${UNKNOWN_NODE_DIRECTIVE}[${escapeLabel(plainText(element))}]{type="${type}" json="${json}"}`;
};

/** 元素沿用 children 协议，文本载体只接受基础 formatted 叶子。 */
export const parseUnknownNode = (json: string | undefined): Descendant | null => {
  if (!json) return null;
  try {
    const node: unknown = JSON.parse(json);
    if (
      node &&
      typeof node === "object" &&
      (node as NodeLike).type === "formatted" &&
      typeof (node as NodeLike).text === "string" &&
      !("children" in node)
    ) {
      return node as Descendant;
    }
    if (
      node &&
      typeof node === "object" &&
      typeof (node as NodeLike).type === "string" &&
      (node as NodeLike).type !== "formatted" &&
      Array.isArray((node as NodeLike).children)
    ) {
      return node as Descendant;
    }
  } catch {
    // 损坏的兜底块按普通指令处理
  }
  return null;
};

/** 导入时还原出的节点：子树已完整，不再递归解析 Markdown 子节点，也不做导入期规范化 */
const restoredNodes = new WeakSet<object>();

export const markRestored = <T extends object>(node: T): T => {
  restoredNodes.add(node);
  return node;
};

export const isRestoredNode = (node: unknown): boolean =>
  typeof node === "object" && node !== null && restoredNodes.has(node);
