/**
 * 放入物料：把库里的内容变成文档卡落到白板上。所有放入入口（/、工具栏、右键、从卡片拖出）最终都走这里。
 * - 单篇放入且已在板上：不重复放，镜头带过去并选中（连线请求除外，那时要的是一条新连线）；
 * - 文档模式（协作白板）先为每篇建立稳定引用，失败不写入；切库或画布失活时丢弃；
 * - 插入、连线与选中是一次提交，一步撤销。
 */

import { getWhiteboardDocument } from "@tau/whiteboard/collaboration";
import {
  placeDocuments,
  ViewPortTransforms,
  type Board,
  type DocumentElement,
  type DocumentInsertRequest,
  type DocumentKind,
} from "@tau/whiteboard";
import { toast } from "@tau/ui";
import { referenceWhiteboardEntity } from "@/commands/whiteboard-document";
import useSettingStore from "@/stores/useSettingStore";
import type { EntityCandidate, EntityKind } from "@/types";
import { documentInsertTranslator } from "../../insert.i18n";
import type { RelatedReasonKind } from "./related";

/** 可放进白板的实体：日记只能选某一条碎碎念，不能整天放入；PDF 放的是整份 */
export const INSERTABLE_KINDS: EntityKind[] = [
  "card",
  "article",
  "project_item",
  "pdf",
  "diary-moment",
];

export interface InsertTarget {
  entityRef: { kind: DocumentKind; id: number };
  title: string;
}

/** 检索候选 → 文档卡身份；不能放入的类型返回 null */
export function toInsertTarget(candidate: Pick<EntityCandidate, "kind" | "id" | "title">) {
  const kind: DocumentKind | null =
    candidate.kind === "project_item"
      ? "project-item"
      : candidate.kind === "card" ||
          candidate.kind === "article" ||
          candidate.kind === "diary-moment" ||
          candidate.kind === "pdf"
        ? candidate.kind
        : null;
  return kind ? { entityRef: { kind, id: candidate.id }, title: candidate.title } : null;
}

export type MaterialNote =
  | { kind: "metadata"; meta: string; time: number; now: number }
  | { kind: "related"; reasonKind: RelatedReasonKind };

export interface MaterialGroup {
  id: "related" | "search" | "recent";
  title?: string;
  options: MaterialOption[];
}

/** 检索结果里的一行：放入面板与素材架共用 */
export interface MaterialOption extends InsertTarget {
  key: string;
  kind: EntityKind;
  /** 右侧说明：所属项目、时间，或相关原因 */
  note: MaterialNote;
}

export const targetKey = (target: InsertTarget) =>
  `${target.entityRef.kind}:${target.entityRef.id}`;

export function toMaterialOption(candidate: EntityCandidate, now: number): MaterialOption | null {
  const target = toInsertTarget(candidate);
  if (!target) return null;
  return {
    ...target,
    key: targetKey(target),
    kind: candidate.kind,
    note: { kind: "metadata", meta: candidate.meta, time: candidate.time, now },
  };
}

const sameTarget = (element: DocumentElement, target: InsertTarget) =>
  element.entityRef?.kind === target.entityRef.kind && element.entityRef.id === target.entityRef.id;

/** 板上已有的同一篇（只看顶层与容器内的文档卡） */
export function findPlacedDocument(board: Board, target: InsertTarget): DocumentElement | null {
  const visit = (
    nodes: readonly { type: string; children?: unknown[] }[]
  ): DocumentElement | null => {
    for (const node of nodes) {
      if (node.type === "document" && sameTarget(node as DocumentElement, target))
        return node as DocumentElement;
      const child = node.children && visit(node.children as typeof nodes);
      if (child) return child;
    }
    return null;
  };
  return visit(board.children);
}

/** 板上已放过的内容键，供检索面板标「板上」 */
export function placedKeys(board: Pick<Board, "children">): Set<string> {
  const keys = new Set<string>();
  const visit = (nodes: readonly { type: string; children?: unknown[] }[]) => {
    for (const node of nodes) {
      const ref = node.type === "document" ? (node as DocumentElement).entityRef : undefined;
      if (ref) keys.add(`${ref.kind}:${ref.id}`);
      if (node.children) visit(node.children as typeof nodes);
    }
  };
  visit(board.children);
  return keys;
}

export async function insertDocuments(
  board: Board,
  targets: readonly InsertTarget[],
  request: Pick<DocumentInsertRequest, "at" | "align" | "linkFrom" | "release"> & {
    keepSelection?: boolean;
  }
): Promise<DocumentElement[]> {
  if (targets.length === 0) return [];
  if (targets.length === 1 && !request.linkFrom) {
    const placed = findPlacedDocument(board, targets[0]);
    if (placed) {
      board.select([placed.id]);
      ViewPortTransforms.centerElementsIfNotInViewPort(board, [placed]);
      board.flashElement(placed.id);
      toast.info(documentInsertTranslator.t("placed"));
      return [];
    }
  }
  const canSubmit = board.captureSubmission();
  const documents: Pick<DocumentElement, "entityRef" | "entity" | "title">[] = targets.map(
    target => ({ ...target })
  );
  if (getWhiteboardDocument(board)) {
    const databaseName = useSettingStore.getState().setting.database.active;
    try {
      const entities = await Promise.all(
        targets.map(target =>
          referenceWhiteboardEntity(databaseName, target.entityRef.kind, target.entityRef.id)
        )
      );
      // 文档模式只存稳定引用，不存本机 id
      entities.forEach((entity, index) => {
        documents[index] = { entity, title: targets[index].title };
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : documentInsertTranslator.t("reference.failed")
      );
      throw error;
    }
    if (useSettingStore.getState().setting.database.active !== databaseName) return [];
  }
  if (!canSubmit()) return [];
  // 普通白板按路径撤销，正式插入前先移除占据下标的临时箭头。
  request.release?.();
  return placeDocuments(board, documents, request);
}
