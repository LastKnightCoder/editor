import type Board from "./Board";
import { menuText } from "./menu-i18n";
import type { Translator } from "@tau/i18n";
import type { WhiteboardMessageKey } from "./messages";
import type { ElementCreateSpec } from "./extensions/api";
import { geometryItems } from "./components/Toolbar/Geometry/config";
import {
  SELECT_TOOL_ID,
  HAND_TOOL_ID,
  GEOMETRY_TOOL_ID,
  ARROW_TOOL_ID,
  HANDWRITE_TOOL_ID,
  RICHTEXT_TOOL_ID,
  MIND_TOOL_ID,
  FRAME_TOOL_ID,
  COLUMN_TOOL_ID,
} from "./constants/tools";

type Translate = Translator<WhiteboardMessageKey>["t"];
const toolLabels: Record<string, WhiteboardMessageKey> = {
  [SELECT_TOOL_ID]: "toolbar.select",
  [HAND_TOOL_ID]: "toolbar.hand",
  [GEOMETRY_TOOL_ID]: "toolbar.geometry",
  [ARROW_TOOL_ID]: "toolbar.arrow",
  [HANDWRITE_TOOL_ID]: "toolbar.handwrite",
  [RICHTEXT_TOOL_ID]: "toolbar.text",
  [MIND_TOOL_ID]: "toolbar.mind",
  [FRAME_TOOL_ID]: "toolbar.frame",
  [COLUMN_TOOL_ID]: "toolbar.column",
};
const shapeLabels: Record<string, WhiteboardMessageKey> = {
  rectangle: "shape.rectangle",
  circle: "shape.circle",
  triangle: "shape.triangle",
  diamond: "shape.diamond",
  capsule: "shape.capsule",
  parallelogram: "shape.parallelogram",
  trapezoid: "shape.trapezoid",
  hexagon: "shape.hexagon",
  cylinder: "shape.cylinder",
  document: "shape.document",
  "speech-bubble": "shape.speech-bubble",
  cloud: "shape.cloud",
  "block-arrow": "shape.block-arrow",
  star: "shape.star",
  heart: "shape.heart",
};
export function toolLabel(id: string, original: string, t: Translate): string {
  return toolLabels[id] ? t(toolLabels[id]) : original;
}
export function geometryLabel(type: string, original: string, t: Translate): string {
  return shapeLabels[type] ? t(shapeLabels[type]) : original;
}
export function geometryMenuText(board: Board, type: string, original: string) {
  const key = shapeLabels[type];
  return key ? menuText(board, key) : { label: original };
}
export function createHint(
  spec: ElementCreateSpec,
  id: string,
  options: Readonly<Record<string, unknown>> | null,
  fallbackLabel: string,
  t: Translate
): readonly string[] {
  const explicit = typeof spec.hint === "function" ? spec.hint(options) : spec.hint;
  if (explicit?.length) return explicit;
  switch (id) {
    case GEOMETRY_TOOL_ID: {
      const shape =
        geometryItems.find(item => item.geometryType === options?.geometryType) ?? geometryItems[0];
      return [
        t("hint.draw", { label: geometryLabel(shape.geometryType, shape.name, t) }),
        t("hint.aspect"),
        t("hint.center"),
      ];
    }
    case ARROW_TOOL_ID:
      return [t("hint.arrow"), t("hint.snap")];
    case HANDWRITE_TOOL_ID:
      return [t("hint.handwrite"), t("hint.stay")];
    case RICHTEXT_TOOL_ID:
      return [t("hint.text")];
    case MIND_TOOL_ID:
      return [t("hint.mind")];
    case FRAME_TOOL_ID:
      return [t("hint.frame"), t("hint.frameContents")];
    case COLUMN_TOOL_ID:
      return [t("hint.column")];
    default:
      return [t(spec.gesture === "click" ? "hint.place" : "hint.draw", { label: fallbackLabel })];
  }
}
