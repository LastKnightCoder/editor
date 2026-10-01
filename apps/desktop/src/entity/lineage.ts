/**
 * 谱系端点：「A 衍生出 B」的两端。比 EntityRef（四类正文实体）宽——还包括外部材料（摘录、
 * PDF 标注、剪藏解析文档）、对话、Notebook 笔记、闪卡；对话 id 是字符串。纯 TypeScript，主进程与渲染端共用。
 *
 * 只记推导不出来的事实（复制、从对话存下、剪藏）；共用正文的投影与闪卡引用查询时推导，不入谱系（KL-008）。
 */

import { isMaterialKind, type MaterialRef } from "./material";
import { type EntityRef, normalizeEntityRefKind } from "./ref";

export type LineageNode =
  | EntityRef
  | MaterialRef
  | { kind: "chat-session"; id: string }
  | { kind: "vl-note"; id: number }
  | { kind: "flashcard"; id: number };

export type LineageNodeKind = LineageNode["kind"];

export const LINEAGE_RELATIONS = ["derived", "saved_from", "clipped_from", "excerpt_of"] as const;

/**
 * derived：复制出来，之后各自演化；saved_from：由对话中的消息存成；
 * clipped_from：剪藏解析自网页条目；excerpt_of：由某条摘录 / PDF 标注写成
 */
export type LineageRelation = (typeof LINEAGE_RELATIONS)[number];

/** 来源的位置：对话里的哪几条消息（一条回答由多个 pi entry 组成） */
export interface LineageAnchor {
  messageIds?: string[];
}

export interface LineageRecord {
  src: LineageNode;
  dst: LineageNode;
  relation: LineageRelation;
  srcAnchor?: LineageAnchor;
}

/** 存储层的 kind / id 都是文本 */
export interface StoredLineageNode {
  kind: string;
  id: string;
}

const EXTRA_KINDS = new Set(["vl-note", "flashcard"]);

export const toStoredLineageNode = (node: LineageNode): StoredLineageNode => ({
  kind: node.kind,
  id: String(node.id),
});

/** 存储的文本 → LineageNode；不认识的 kind 或非法 id 返回 null，由调用方丢弃 */
export function fromStoredLineageNode(kind: string, id: string): LineageNode | null {
  if (kind === "chat-session") return id ? { kind, id } : null;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;
  if (isMaterialKind(kind)) return { kind, id: numericId };
  if (EXTRA_KINDS.has(kind)) return { kind: kind as "vl-note" | "flashcard", id: numericId };
  const entityKind = normalizeEntityRefKind(kind);
  return entityKind ? { kind: entityKind, id: numericId } : null;
}

export const isLineageRelation = (value: unknown): value is LineageRelation =>
  typeof value === "string" && (LINEAGE_RELATIONS as readonly string[]).includes(value);

export const lineageNodeKey = (node: LineageNode): string => `${node.kind}:${node.id}`;
