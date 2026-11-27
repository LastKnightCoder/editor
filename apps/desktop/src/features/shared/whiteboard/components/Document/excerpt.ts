import { documentReaderTranslator } from "../../reader.i18n";
/**
 * 摘录：把阅读纸里的一条 PDF 标注摘到白板上。
 * - 原文、笔记、颜色、来源标题存快照：来源删除后照样显示；摘录不进库、不建索引；
 * - 生成时从来源卡连一条虚线箭头（普通箭头，可以删，删了不影响回到原文）；
 * - 点一下「放到白板」：停靠阅读时放在来源卡左侧的空白处，居中阅读时收起后放在来源卡右侧；
 *   拖出纸面：落在哪里放在哪里（拖放数据走自有 MIME，由 tau.desktop-materials 的 ingest 认领）。
 */

import {
  placeExcerpt,
  ViewPortTransforms,
  type Board,
  type BoardElement,
  type DocumentElement,
  type ExcerptElement,
  type WhiteboardAPI,
} from "@tau/whiteboard";
import { getWhiteboardDocument } from "@tau/whiteboard/collaboration";
import { toast } from "@tau/ui";
import { referenceWhiteboardEntity } from "@/commands/whiteboard-document";
import useSettingStore from "@/stores/useSettingStore";
import type { Pdf, PdfAnnotation } from "@/types";
import {
  annotationColor,
  annotationPage,
  annotationText,
  noteText,
} from "@/features/pdfs/reader/annotationModel";

export type ExcerptDraft = Pick<
  ExcerptElement,
  "source" | "quote" | "note" | "color" | "sourceTitle"
>;

export function excerptFromAnnotation(
  pdf: Pick<Pdf, "id">,
  record: PdfAnnotation,
  sourceTitle: string,
  entity?: DocumentElement["entity"]
): ExcerptDraft {
  const note = noteText(record);
  return {
    source:
      entity?.kind === "pdf"
        ? {
            kind: "pdf",
            entity: { ...entity, kind: "pdf" },
            annotationObjectId: record.annotation.id,
            page: annotationPage(record),
          }
        : { kind: "pdf", pdfId: pdf.id, annotationId: record.id, page: annotationPage(record) },
    quote:
      record.type === "area"
        ? `区域截图 · 第 ${annotationPage(record)} 页`
        : annotationText(record.annotation),
    ...(note ? { note } : {}),
    color: annotationColor(record),
    sourceTitle,
  };
}

const GAP = 72;
const STACK = 18;

/** 来源卡旁边已经有的摘录数：新摘录往下错开，不叠在一起 */
function excerptsBeside(board: Board, card: BoardElement) {
  return board.children.filter(
    element =>
      element.type === "excerpt" &&
      board.children.some(
        arrow =>
          arrow.type === "arrow" &&
          arrow.source?.bindId === card.id &&
          arrow.target?.bindId === element.id
      )
  ).length;
}

/** 点「放到白板」：放在来源卡右侧，同一张卡的多条摘录依次往下排 */
export async function placeExcerptBeside(board: Board, card: BoardElement, draft: ExcerptDraft) {
  if (board.readonly || !board.captureSubmission()()) return null;
  const index = excerptsBeside(board, card);
  const element = placeExcerpt(board, draft, {
    at: {
      x: card.x + card.width + GAP,
      y: card.y + 90 + index * (150 + STACK),
    },
    linkFrom: card.id,
  });
  ViewPortTransforms.centerElementsIfNotInViewPort(board, [element]);
  board.flashElement(element.id);
  return element;
}

export const EXCERPT_MIME = "application/x-tau-whiteboard-excerpt";

interface ExcerptPayload {
  excerpt: ExcerptDraft;
  linkFrom?: string;
  localSource?: { database: string; annotationObjectId: string };
}

export function setExcerptDrag(event: DragEvent | React.DragEvent, payload: ExcerptPayload) {
  const transfer = event.dataTransfer;
  if (!transfer) return;
  transfer.effectAllowed = "copy";
  transfer.setData(EXCERPT_MIME, JSON.stringify(payload));
  transfer.setData("text/plain", payload.excerpt.quote ?? "");
}

function readPayload(event: DragEvent): ExcerptPayload | null {
  const raw = event.dataTransfer?.getData(EXCERPT_MIME);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as ExcerptPayload;
    return value?.excerpt && typeof value.excerpt === "object" ? value : null;
  } catch {
    return null;
  }
}

export const excerptIngest = {
  id: "tau.desktop-materials.excerpt-drop",
  source: "drop" as const,
  accepts: (event: ClipboardEvent | DragEvent) =>
    "dataTransfer" in event && !!event.dataTransfer?.types.includes(EXCERPT_MIME),
  run: async (api: WhiteboardAPI, event: ClipboardEvent | DragEvent) => {
    const drag = event as DragEvent;
    const payload = readPayload(drag);
    if (!payload) return;
    let point: { x: number; y: number };
    try {
      point = api.screenToCanvas({ x: drag.clientX, y: drag.clientY });
    } catch {
      return;
    }
    let excerpt = payload.excerpt;
    const source = excerpt.source;
    if (source?.kind === "pdf" && "pdfId" in source) {
      const database = useSettingStore.getState().setting.database.active;
      const local = payload.localSource;
      if (!local || local.database !== database) {
        toast.info(documentReaderTranslator.t("excerpt.database"));
        return;
      }
      if (getWhiteboardDocument(api)) {
        // 普通白板拖入共享白板时，在落点将本机行号转换为稳定身份。
        const canSubmit = api.captureSubmission();
        const entity = await referenceWhiteboardEntity(database, "pdf", source.pdfId).catch(
          () => null
        );
        if (!canSubmit() || database !== useSettingStore.getState().setting.database.active) return;
        if (entity?.kind !== "pdf") {
          toast.error(documentReaderTranslator.t("excerpt.referenceFailed"));
          return;
        }
        excerpt = {
          ...excerpt,
          source: {
            kind: "pdf",
            entity: { ...entity, kind: "pdf" },
            annotationObjectId: local.annotationObjectId,
            page: source.page,
          },
        };
      }
    }
    const element = placeExcerpt(api, excerpt, {
      at: point,
      align: "center",
      linkFrom: payload.linkFrom,
    });
    api.flashElement(element.id);
  },
};
