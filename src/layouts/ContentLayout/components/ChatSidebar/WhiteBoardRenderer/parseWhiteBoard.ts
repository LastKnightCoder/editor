import { parse } from "yaml";
import { v4 as uuid } from "uuid";
import { Descendant } from "slate";
import {
  EArrowLineType,
  EMarkerType,
  type ArrowElement,
} from "@/components/WhiteBoard/types/arrow";
import { type FrameElement } from "@/components/WhiteBoard/types/frame";
import { type BoardElement } from "@/components/WhiteBoard/types/board";
import type {
  WhiteboardYAML,
  ParsedElement,
  ParsedArrowElement,
  ColorKeyword,
} from "./types";
import { getColorConfig } from "./types";

// Basic paragraph builder for text content
const paragraph = (text: string): Descendant[] => [
  { type: "paragraph", children: [{ type: "formatted", text }] },
];

// Map YAML marker to WhiteBoard marker
const toMarker = (marker?: string): EMarkerType => {
  switch (marker) {
    case "arrow":
      return EMarkerType.Arrow;
    case "diamond":
      return EMarkerType.Diamond;
    case "circle":
      return EMarkerType.Circle;
    case "open-arrow":
      return EMarkerType.OpenArrow;
    case "closed-arrow":
      return EMarkerType.ClosedArrow;
    case "none":
    default:
      return EMarkerType.None;
  }
};

// Generate normalized paths (unit space) for default renderer fallback
const generatePaths = (geometryType: string): string[] => {
  switch (geometryType) {
    case "rect":
      return ["M 0 0 H 1 V 1 H 0 Z"];
    case "circle":
      return ["M 1 0.5 A 0.5 0.5 0 1 0 0 0.5 A 0.5 0.5 0 1 0 1 0.5 Z"];
    case "ellipse":
      return ["M 1 0.5 A 0.5 0.35 0 1 0 0 0.5 A 0.5 0.35 0 1 0 1 0.5 Z"];
    case "diamond":
      return ["M 0.5 0 L 1 0.5 L 0.5 1 L 0 0.5 Z"];
    default:
      return ["M 0 0 H 1 V 1 H 0 Z"];
  }
};

// Resolve arrow endpoint (id.position or [x,y])
function resolveArrowEndpoint(endpoint: ParsedArrowElement["from"]): {
  marker: EMarkerType;
  connectId?: string;
  bindId?: string;
  point: { x: number; y: number };
} {
  if (Array.isArray(endpoint)) {
    const [x, y] = endpoint;
    return { marker: EMarkerType.None, point: { x, y } };
  }
  const [id, position = "center"] = endpoint.split(".");
  return {
    marker: EMarkerType.None,
    bindId: id,
    connectId: position as any,
    point: { x: 0, y: 0 },
  };
}

export function parseWhiteBoard(code: string, isDark = false): BoardElement[] {
  if (!code.trim()) return [];
  const parsed = parse(code) as WhiteboardYAML;
  if (!parsed || !Array.isArray(parsed.elements)) return [];

  const elements: BoardElement[] = [];

  for (const el of parsed.elements as ParsedElement[]) {
    switch (el.type) {
      case "rect":
      case "circle":
      case "ellipse":
      case "diamond": {
        const g = el as any;
        const colorConfig = getColorConfig(g.color as ColorKeyword, isDark);
        const geom = {
          id: g.id || uuid(),
          type: "geometry",
          geometryType: g.type === "rect" ? "rectangle" : g.type,
          x: g.x,
          y: g.y,
          width: g.width,
          height: g.height,
          fill: colorConfig.fill,
          stroke: colorConfig.stroke,
          strokeWidth: 2,
          paths: generatePaths(g.type),
          text: { align: "center", content: g.text ? paragraph(g.text) : [] },
        } as any;
        elements.push(geom);
        break;
      }
      case "text": {
        const t = el as any;
        const colorConfig = getColorConfig(t.color as ColorKeyword, isDark);
        // 使用大模型提供的宽高，或根据文字长度估算
        const textLength = t.text?.length || 0;
        const estimatedWidth = Math.max(80, textLength * 14);
        const textEl = {
          id: t.id || uuid(),
          type: "geometry",
          geometryType: "rectangle",
          x: t.x,
          y: t.y,
          width: t.width || estimatedWidth,
          height: t.height || 40,
          fill: "transparent",
          stroke: "transparent",
          strokeWidth: 0,
          paths: ["M 0 0 H 1 V 1 H 0 Z"],
          text: { align: "left", content: paragraph(t.text || "") },
          color: colorConfig.text,
        } as any;
        elements.push(textEl);
        break;
      }
      case "image": {
        const img = el as any;
        const imageEl = {
          id: img.id || uuid(),
          type: "image",
          x: img.x,
          y: img.y,
          width: img.width,
          height: img.height,
          src: img.src,
        } as any;
        elements.push(imageEl);
        break;
      }
      case "frame": {
        const f = el as any;
        const colorConfig = getColorConfig(f.color as ColorKeyword, isDark);
        const frame: FrameElement = {
          id: f.id || uuid(),
          type: "frame",
          title: f.title || "",
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          children: [],
          backgroundColor: colorConfig.fill,
          borderColor: colorConfig.stroke,
          borderWidth: 2,
          borderRadius: 8,
          padding: 8,
          containmentPolicy: "full",
          removalPolicy: "full",
          autoResize: false,
          minWidth: 100,
          minHeight: 60,
        };
        elements.push(frame);
        break;
      }
      case "arrow": {
        const a = el as ParsedArrowElement;
        const from = resolveArrowEndpoint(a.from);
        const to = resolveArrowEndpoint(a.to);
        const colorConfig = getColorConfig(a.color as ColorKeyword, isDark);
        const arrow: ArrowElement = {
          id: a.id || uuid(),
          type: "arrow",
          lineType: EArrowLineType.CURVE,
          source: {
            marker: EMarkerType.None,
            connectId: from.connectId,
            bindId: from.bindId,
          },
          target: {
            marker: toMarker(a.marker),
            connectId: to.connectId,
            bindId: to.bindId,
          },
          points: [from.point, to.point],
          lineColor: colorConfig.stroke,
          lineWidth: 2,
          dashed: !!a.dashed,
        };
        elements.push(arrow);
        break;
      }
      default:
        break;
    }
  }

  return elements;
}
