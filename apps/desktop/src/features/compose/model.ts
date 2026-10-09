/**
 * 创作模式的纯函数：白板上的资料清单、召集结果的摆放、移走的识别、正文里已引用的资料。
 */

import { v4 as getUuid } from "uuid";
import { Element, Node, type Descendant } from "slate";
import {
  DOCUMENT_DEFAULT_SIZE,
  FrameUtil,
  type BoardElement,
  type DocumentElement,
  type FrameElement,
} from "@tau/whiteboard";
import { entityRefKey, normalizeEntityRefKind, type EntityRef } from "@/entity/ref";
import type { GatherGroup } from "@/types/compose";

/** AI 召集摆上来的元素记号：删除时据此记为「不要」，用户手动放的不记 */
export const COMPOSE_ORIGIN = "gather";

export type ComposeDocumentElement = DocumentElement & {
  composeOrigin?: typeof COMPOSE_ORIGIN;
  /** 召集时 AI 写的一句为什么相关 */
  composeWhy?: string;
};

export interface BoardDocument {
  elementId: string;
  key: string;
  ref: EntityRef;
  title: string;
  gathered: boolean;
}

const isDocument = (element: BoardElement): element is ComposeDocumentElement =>
  element.type === "document";

/** 白板上所有文档卡（含 frame / 分栏里的），按出现顺序 */
export function collectDocuments(children: BoardElement[]): BoardDocument[] {
  const result: BoardDocument[] = [];
  const visit = (elements: BoardElement[]) => {
    for (const element of elements) {
      if (isDocument(element)) {
        result.push({
          elementId: element.id,
          key: entityRefKey(element.entityRef),
          ref: element.entityRef,
          title: element.title ?? "",
          gathered: element.composeOrigin === COMPOSE_ORIGIN,
        });
      }
      if (Array.isArray(element.children)) visit(element.children as BoardElement[]);
    }
  };
  visit(children);
  return result;
}

/** 前后两次画布之间被移走的召集资料（同一份还在别处的不算） */
export function removedGatheredKeys(before: BoardDocument[], after: BoardDocument[]): string[] {
  const remaining = new Set(after.map(doc => doc.key));
  return [
    ...new Set(before.filter(doc => doc.gathered && !remaining.has(doc.key)).map(doc => doc.key)),
  ];
}

/** 正文里 content-link 指向的实体 */
export function citedKeys(content: Descendant[]): Set<string> {
  const keys = new Set<string>();
  for (const [node] of Node.nodes({ children: content } as Node)) {
    if (!Element.isElement(node) || (node as { type?: string }).type !== "content-link") continue;
    const link = node as unknown as { contentType?: string; refId?: number };
    const kind = normalizeEntityRefKind(link.contentType);
    if (kind && Number.isSafeInteger(link.refId)) keys.add(`${kind}:${link.refId}`);
  }
  return keys;
}

/** 组内列数：少的排两列，多的（已关联可能有几十份）排近似方阵，最多四列 */
const columnsFor = (count: number) =>
  Math.min(count, count <= 4 ? 2 : Math.min(4, Math.ceil(Math.sqrt(count))));
const GAP = 28;
const FRAME_PADDING = 24;
const FRAME_TITLE_SPACE = 52;
const GROUP_GAP = 72;

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** 画布已有内容的包围盒；空画布为 null */
export function boundsOf(children: BoardElement[]): Bounds | null {
  if (!children.length) return null;
  return children.reduce<Bounds>(
    (box, element) => ({
      minX: Math.min(box.minX, element.x),
      minY: Math.min(box.minY, element.y),
      maxX: Math.max(box.maxX, element.x + element.width),
      maxY: Math.max(box.maxY, element.y + element.height),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );
}

/** 进入创作模式时，文章已关联的资料单独成组 */
export const LINKED_GROUP_NAME = "已关联";

/**
 * 召集结果的摆放：每组一个 frame，组内文档卡排成网格；各组从左到右排开。
 * 空画布从原点开始，否则接在已有内容右侧，不覆盖用户摆好的东西。
 * gathered = false 时（已关联的资料）不记召集来源，删掉不算「不要」。
 */
export function layoutGather(
  groups: GatherGroup[],
  existing: Bounds | null,
  { gathered = true }: { gathered?: boolean } = {}
): FrameElement[] {
  let left = existing ? existing.maxX + GROUP_GAP * 2 : 0;
  const top = existing ? existing.minY : 0;
  return groups
    .filter(group => group.items.length)
    .map(group => {
      const cell = group.items.reduce(
        (size, item) => {
          const next = DOCUMENT_DEFAULT_SIZE[item.ref.kind];
          return {
            width: Math.max(size.width, next.width),
            height: Math.max(size.height, next.height),
          };
        },
        { width: 0, height: 0 }
      );
      const columns = columnsFor(group.items.length);
      const rows = Math.ceil(group.items.length / columns);
      const width = FRAME_PADDING * 2 + columns * cell.width + (columns - 1) * GAP;
      const height = FRAME_TITLE_SPACE + FRAME_PADDING + rows * cell.height + (rows - 1) * GAP;
      const frame = FrameUtil.createFrame(left, top, width, height, group.name);
      frame.children = group.items.map((item, index): ComposeDocumentElement => {
        const size = DOCUMENT_DEFAULT_SIZE[item.ref.kind];
        return {
          id: getUuid(),
          type: "document",
          entityRef: item.ref,
          title: item.title,
          x: left + FRAME_PADDING + (index % columns) * (cell.width + GAP),
          y: top + FRAME_TITLE_SPACE + Math.floor(index / columns) * (cell.height + GAP),
          ...size,
          ...(gathered ? { composeOrigin: COMPOSE_ORIGIN } : {}),
          ...(item.why ? { composeWhy: item.why } : {}),
        };
      });
      left += width + GROUP_GAP;
      return frame;
    });
}
