import {
  prepareWhiteboardContract,
  type WhiteboardContractDefinition,
  type PreparedWhiteboardContract,
} from "@tau/db-schema/content-contracts";
import type { WhiteboardCanvasType } from "./types";

interface BuiltinSpec extends Omit<WhiteboardContractDefinition, "type" | "dataVersion"> {
  data: readonly string[];
  transient?: readonly string[];
  body?: string;
}
const common = ["groupId", "resizable", "autoHeight", "sketch"];
/** 仅分类宿主已知字段；未知插件仍由其精确契约处理。 */
const specs: Readonly<Record<string, BuiltinSpec>> = {
  richtext: {
    data: ["maxWidth", "maxHeight", "resized", "variant", "tone", "readonly"],
    transient: ["autoFocus"],
    body: "content",
    structure: { text: "richtext", joins: ["layout"], reference: "entity" },
  },
  geometry: {
    data: [
      "geometryType",
      "theme",
      "color",
      "fill",
      "fillOpacity",
      "stroke",
      "strokeWidth",
      "strokeOpacity",
      "fillStyle",
      "paths",
      "extraInfo",
      "text",
    ],
    body: "text.content",
    structure: { text: "richtext" },
  },
  arrow: {
    data: [
      "lineType",
      "source",
      "target",
      "points",
      "lineWidth",
      "dashed",
      "dashArray",
      "animated",
      "animationSpeed",
      "midPoint",
      "themeColorId",
    ],
    body: "description",
    structure: { text: "richtext", canBeContained: false },
  },
  "mind-node": {
    data: [
      "direction",
      "isLeftFold",
      "isRightFold",
      "themeId",
      "themeStyle",
      "theme",
      "background",
      "border",
      "textColor",
      "contentTitle",
    ],
    transient: [
      "defaultFocus",
      "actualHeight",
      "level",
      "childrenHeight",
      "leftChildrenHeight",
      "rightChildrenHeight",
      "contentId",
    ],
    body: "text",
    structure: { text: "richtext", container: "free", reference: "entity" },
  },
  column: {
    data: ["title", "color", "collapsed", "padding", "gap", "minWidth", "maxWidth"],
    transient: [
      "isChildDraggingOver",
      "dropIndex",
      "draggingChildId",
      "draggingPosition",
      "dropPlaceholderHeight",
    ],
    collaboration: { textFields: ["title"] },
    structure: { container: "layout", canBeContained: false },
  },
  frame: {
    data: [
      "title",
      "titlePosition",
      "backgroundColor",
      "borderColor",
      "borderWidth",
      "borderRadius",
      "borderStyle",
      "padding",
      "containmentPolicy",
      "removalPolicy",
      "autoResize",
      "minWidth",
      "minHeight",
    ],
    transient: ["isChildMoveIn"],
    collaboration: { textFields: ["title"] },
    structure: { container: "free" },
  },
  handwrite: { data: ["points", "outline", "segmented"], structure: { container: "free" } },
  "host.whiteboard.stroke-segment": { data: ["points"] },
  image: {
    data: [
      "src",
      "naturalWidth",
      "naturalHeight",
      "showDescription",
      "description",
      "descriptionPosition",
      "descriptionAlignment",
      "descriptionStyle",
      "shadowSize",
    ],
    collaboration: { textFields: ["description"] },
    resources: [{ path: "src", kind: "image" }],
    structure: { joins: ["layout"] },
  },
  audio: {
    data: ["src", "duration", "title", "isFromTTS", "ttsText"],
    collaboration: { textFields: ["title", "ttsText"] },
    resources: [{ path: "src", kind: "audio" }],
    structure: { joins: ["layout"] },
  },
  video: {
    data: ["src", "naturalWidth", "naturalHeight", "metaInfo"],
    transient: ["videoNoteId"],
    resources: [{ path: "src", kind: "video" }],
    structure: { joins: ["layout"], reference: "entity" },
  },
  webview: {
    data: ["url", "sourceType"],
    resources: [{ path: "url", kind: "file" }],
    structure: { joins: ["layout"] },
  },
  document: {
    data: ["title"],
    collaboration: { textFields: ["title"] },
    structure: { reference: "entity", joins: ["layout"] },
  },
  whiteboard: {
    data: [
      "description",
      "snapshot",
      "maxWidth",
      "maxHeight",
      "resized",
      "fill",
      "fillOpacity",
      "theme",
    ],
    resources: [{ path: "snapshot", kind: "image" }],
    structure: { reference: "entity", joins: ["layout"] },
  },
};
export async function prepareBuiltinWhiteboardTypes(): Promise<{
  types: Record<string, WhiteboardCanvasType>;
  prepared: readonly PreparedWhiteboardContract[];
}> {
  const types: Record<string, WhiteboardCanvasType> = {};
  const prepared = await Promise.all(
    Object.entries(specs).map(async ([type, spec]) => {
      const entry = await prepareWhiteboardContract("host.whiteboard", {
        type,
        dataVersion: 1,
        collaboration: spec.collaboration,
        resources: spec.resources,
        structure: spec.structure,
      });
      types[type] = {
        contractId: entry.id,
        dataProperties: [...common, ...spec.data],
        transientProperties: spec.transient,
        bodyProperty: spec.body,
      };
      return entry;
    })
  );
  return { types, prepared };
}
/** 同一字段映射供活动画布与只读示意图使用，不推断未知契约。 */
export function canvasFields(
  node: { contractId: string; data: Readonly<Record<string, unknown>>; body?: unknown },
  codec?: WhiteboardCanvasType
): Record<string, unknown> {
  if (!codec || codec.contractId !== node.contractId) return {};
  const result = Object.fromEntries(
    (codec.dataProperties ?? [])
      .filter(key => Object.hasOwn(node.data, key))
      .map(key => [key, node.data[key]])
  );
  if (codec.bodyProperty && node.body !== undefined) {
    const path = codec.bodyProperty.split(".");
    let current = result;
    for (const key of path.slice(0, -1)) {
      current[key] = { ...((current[key] as Record<string, unknown>) ?? {}) };
      current = current[key] as Record<string, unknown>;
    }
    current[path.at(-1)!] = node.body;
  }
  return result;
}
