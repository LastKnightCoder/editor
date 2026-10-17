import {
  ArrowUpRight,
  AudioLines,
  Columns3,
  Frame,
  Globe,
  Image,
  Network,
  PenLine,
  Presentation,
  FileText,
  Shapes,
  Type,
  Video,
  Box,
  type LucideIcon,
} from "lucide-react";
import { richTextPlainText } from "@tau/shared/rich-text-text";
import type { BoardElement } from "../../../types";
import { geometryItems } from "../../Toolbar/Geometry/config";
import type { WhiteboardElementDefinition } from "../../../extensions/api";
import { createSnapshotReader } from "../../../extensions/snapshot";

type Definitions = (type: string) => WhiteboardElementDefinition | undefined;
const snapshot = createSnapshotReader();

/** 元素类型 → 中文名 + 中性图标（元素树 / 右键菜单共用；不按类型配色） */
const META: Record<string, { label: string; icon: LucideIcon }> = {
  geometry: { label: "图形", icon: Shapes },
  arrow: { label: "箭头", icon: ArrowUpRight },
  richtext: { label: "文本", icon: Type },
  document: { label: "文档", icon: FileText },
  image: { label: "图片", icon: Image },
  video: { label: "视频", icon: Video },
  audio: { label: "音频", icon: AudioLines },
  webview: { label: "网页", icon: Globe },
  "mind-node": { label: "思维导图", icon: Network },
  frame: { label: "画框", icon: Frame },
  column: { label: "分栏", icon: Columns3 },
  handwrite: { label: "手写", icon: PenLine },
  whiteboard: { label: "白板", icon: Presentation },
};

export function elementTypeMeta(type: string, definitions?: Definitions) {
  const presentation = definitions?.(type)?.presentation;
  if (presentation) return { label: presentation.label, icon: presentation.icon ?? Box };
  return META[type] ?? { label: type, icon: Box };
}

const GEOMETRY_LABEL: Record<string, string> = Object.fromEntries(
  geometryItems.map(item => [item.geometryType, item.name])
);
const MAX_LABEL = 40;

/** 创建时写入的默认名（各类型名与几何具体名）不算手动命名，让位给内容派生名 */
const GENERIC_NAMES = new Set([
  ...Object.values(META).map(m => m.label),
  ...Object.values(GEOMETRY_LABEL),
]);

/** 元素自身内容派生的名字（不含手动命名 / 类型名兜底）；取不到返回空串 */
function contentLabel(
  element: BoardElement,
  lookup?: (id: string) => BoardElement | null | undefined,
  definitions?: Definitions
): string {
  const getName = definitions?.(element.type)?.presentation?.getName;
  if (getName) {
    try {
      const name = getName(snapshot(element));
      if (typeof name === "string") return name;
    } catch (error) {
      console.error("白板元素名称生成失败", error);
    }
  }
  switch (element.type) {
    case "richtext":
      return richTextPlainText(element.content) || element.contentTitle || "";
    case "geometry":
      return richTextPlainText(element.text?.content) || GEOMETRY_LABEL[element.geometryType] || "";
    case "mind-node":
      return richTextPlainText(element.text);
    case "frame":
    case "column":
    case "document":
      return element.title || "";
    case "image":
      return element.description || "";
    case "audio":
      return element.title || "";
    case "webview":
      return typeof element.url === "string" ? element.url.replace(/^https?:\/\//, "") : "";
    case "arrow": {
      const end = (id?: string) => {
        const target = id ? lookup?.(id) : undefined;
        return target ? elementLabel(target, undefined, definitions) : "";
      };
      const from = end(element.source?.bindId);
      const to = end(element.target?.bindId);
      return from || to ? `${from || "·"} → ${to || "·"}` : "";
    }
  }
  return "";
}

/**
 * 元素树行名：手动命名 > 内容（文本首段、图形里的字、画框标题、图片说明、箭头「起点 → 终点」）> 类型名。
 * 箭头端点要查别的元素，传 lookup 才会展开（端点本身不再递归展开箭头）。
 */
export function elementLabel(
  element: BoardElement,
  lookup?: (id: string) => BoardElement | null | undefined,
  definitions?: Definitions
): string {
  const named =
    element.name && (definitions?.(element.type)?.presentation || !GENERIC_NAMES.has(element.name))
      ? element.name
      : "";
  const text = (named || contentLabel(element, lookup, definitions) || element.name || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return elementTypeMeta(element.type, definitions).label;
  return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL)}…` : text;
}
