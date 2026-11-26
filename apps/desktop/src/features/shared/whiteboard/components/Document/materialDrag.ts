/**
 * 物料拖入画布（素材架、阅读纸里的内联引用）：HTML5 拖放，数据放在自有 MIME 里，画布经 ingest 认领。
 * - 落在空白处：从落点起排成一行放下；
 * - 落在某张卡上：放在那张卡旁边，并从那张卡连一条箭头；
 * - linkFrom（引用拖出时为当前阅读的那张卡）：放下后从它连箭头。
 */

import { documentInsertTranslator } from "../../insert.i18n";
import type { WhiteboardAPI } from "@tau/whiteboard";
import { toast } from "@tau/ui";
import { insertDocuments, type InsertTarget } from "./insert";

export const MATERIAL_MIME = "application/x-tau-whiteboard-material";

export interface MaterialPayload {
  targets: InsertTarget[];
  linkFrom?: string;
}

export function setMaterialDrag(
  event: DragEvent | React.DragEvent,
  payload: MaterialPayload,
  preview?: HTMLElement | null
) {
  const transfer = event.dataTransfer;
  if (!transfer) return;
  transfer.effectAllowed = "copy";
  transfer.setData(MATERIAL_MIME, JSON.stringify(payload));
  transfer.setData("text/plain", payload.targets.map(target => target.title).join("\n"));
  if (preview) transfer.setDragImage(preview, 16, 16);
}

const readPayload = (event: DragEvent): MaterialPayload | null => {
  const raw = event.dataTransfer?.getData(MATERIAL_MIME);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as MaterialPayload;
    return Array.isArray(value.targets) ? value : null;
  } catch {
    return null;
  }
};

const DROP_GAP = 72;

/** 落点下的元素（最上层、不含箭头），用来判断「拖到某张卡上」 */
function elementAt(api: WhiteboardAPI, point: { x: number; y: number }) {
  const hits = api.children.filter(
    element =>
      element.type !== "arrow" &&
      typeof element.width === "number" &&
      point.x >= element.x &&
      point.x <= element.x + element.width &&
      point.y >= element.y &&
      point.y <= element.y + element.height
  );
  return hits.at(-1) ?? null;
}

/** 放入一次拖入的物料：落在卡上则放在它右侧并从它连线，落在空白处从落点起排开 */
export async function dropMaterials(
  api: WhiteboardAPI,
  payload: MaterialPayload,
  point: { x: number; y: number }
) {
  const target = elementAt(api, point);
  const request = target
    ? {
        at: { x: target.x + target.width + DROP_GAP, y: target.y + target.height / 2 },
        linkFrom: target.id,
      }
    : { at: point, linkFrom: payload.linkFrom };
  try {
    const placed = await insertDocuments(api, payload.targets, request);
    if (placed.length > 1)
      toast.info(documentInsertTranslator.t("dropped", { count: placed.length }));
    return placed;
  } catch {
    // 失败提示已给出
    return [];
  }
}

export const materialIngest = {
  id: "tau.desktop-materials.drop",
  source: "drop" as const,
  accepts: (event: ClipboardEvent | DragEvent) =>
    "dataTransfer" in event && !!event.dataTransfer?.types.includes(MATERIAL_MIME),
  run: async (api: WhiteboardAPI, event: ClipboardEvent | DragEvent) => {
    const drag = event as DragEvent;
    const payload = readPayload(drag);
    if (!payload?.targets.length) return;
    let point: { x: number; y: number };
    try {
      point = api.screenToCanvas({ x: drag.clientX, y: drag.clientY });
    } catch {
      return;
    }
    await dropMaterials(api, payload, point);
  },
};
