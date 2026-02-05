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

// 默认占位尺寸
const DEFAULT_GEOMETRY_WIDTH = 120;
const DEFAULT_GEOMETRY_HEIGHT = 50;
const DEFAULT_TEXT_WIDTH = 100;
const DEFAULT_TEXT_HEIGHT = 32;
const FRAME_PADDING = 20;

export function parseWhiteBoard(code: string, isDark = false): BoardElement[] {
  if (!code.trim()) return [];
  const parsed = parse(code) as WhiteboardYAML;
  if (!parsed || !Array.isArray(parsed.elements)) return [];

  const elements: BoardElement[] = [];
  const elementMap: Record<string, BoardElement> = {}; // 用于 frame children 查找
  const pendingFrames: {
    parsed: any;
    colorConfig: ReturnType<typeof getColorConfig>;
  }[] = []; // 延迟处理的 frame

  for (const el of parsed.elements as ParsedElement[]) {
    switch (el.type) {
      case "rect":
      case "circle":
      case "ellipse":
      case "diamond": {
        const g = el as any;
        const colorConfig = getColorConfig(g.color as ColorKeyword, isDark);
        // 如果没有提供宽高，使用占位值并标记需要测量
        const hasText = Boolean(g.text);
        const needsMeasure = hasText && (!g.width || !g.height);
        const geom = {
          id: g.id || uuid(),
          type: "geometry",
          geometryType: g.type === "rect" ? "rectangle" : g.type,
          x: g.x ?? 0,
          y: g.y ?? 0,
          width: g.width ?? DEFAULT_GEOMETRY_WIDTH,
          height: g.height ?? DEFAULT_GEOMETRY_HEIGHT,
          fill: colorConfig.fill,
          stroke: colorConfig.stroke,
          strokeWidth: 2,
          paths: generatePaths(g.type),
          text: { align: "center", content: g.text ? paragraph(g.text) : [] },
          _needsMeasure: needsMeasure,
          _rawText: g.text || "",
        } as any;
        elements.push(geom);
        elementMap[geom.id] = geom;
        break;
      }
      case "text": {
        const t = el as any;
        const colorConfig = getColorConfig(t.color as ColorKeyword, isDark);
        // 文本元素始终需要测量
        const textEl = {
          id: t.id || uuid(),
          type: "geometry",
          geometryType: "rectangle",
          x: t.x ?? 0,
          y: t.y ?? 0,
          width: DEFAULT_TEXT_WIDTH,
          height: DEFAULT_TEXT_HEIGHT,
          fill: "transparent",
          stroke: "transparent",
          strokeWidth: 0,
          paths: ["M 0 0 H 1 V 1 H 0 Z"],
          text: { align: "left", content: paragraph(t.text || "") },
          color: colorConfig.text,
          _needsMeasure: true,
          _rawText: t.text || "",
        } as any;
        elements.push(textEl);
        elementMap[textEl.id] = textEl;
        break;
      }
      case "image": {
        const img = el as any;
        const imageEl = {
          id: img.id || uuid(),
          type: "image",
          x: img.x ?? 0,
          y: img.y ?? 0,
          width: img.width ?? 200,
          height: img.height ?? 150,
          src: img.src,
        } as any;
        elements.push(imageEl);
        elementMap[imageEl.id] = imageEl;
        break;
      }
      case "frame": {
        // 延迟处理 frame，等其他元素都解析完
        const f = el as any;
        pendingFrames.push({
          parsed: f,
          colorConfig: getColorConfig(f.color as ColorKeyword, isDark),
        });
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
        elementMap[arrow.id] = arrow;
        break;
      }
      default:
        break;
    }
  }

  // 处理 frame - 根据 children 边界计算位置和宽高
  for (const { parsed: f, colorConfig } of pendingFrames) {
    const childIds: string[] = f.children || [];
    const childElements = childIds
      .map((id: string) => elementMap[id])
      .filter(Boolean);

    // 默认位置和宽高（无 children 时使用 AI 提供的位置）
    let frameX = f.x ?? 0;
    let frameY = f.y ?? 0;
    let frameWidth = 200;
    let frameHeight = 150;

    // 如果有 children，根据 children 完整边界计算位置和宽高
    if (childElements.length > 0) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      childElements.forEach((child: BoardElement) => {
        const childX = child.x ?? 0;
        const childY = child.y ?? 0;
        const childWidth = child.width ?? 0;
        const childHeight = child.height ?? 0;
        minX = Math.min(minX, childX);
        minY = Math.min(minY, childY);
        maxX = Math.max(maxX, childX + childWidth);
        maxY = Math.max(maxY, childY + childHeight);
      });

      if (
        minX !== Infinity &&
        minY !== Infinity &&
        maxX !== -Infinity &&
        maxY !== -Infinity
      ) {
        // Frame 位置 = children 最小边界 - padding
        frameX = minX - FRAME_PADDING;
        frameY = minY - FRAME_PADDING;
        // 宽高 = children 范围 + 两边 padding
        frameWidth = Math.max(100, maxX - minX + 2 * FRAME_PADDING);
        frameHeight = Math.max(60, maxY - minY + 2 * FRAME_PADDING);
      }
    }

    const frame: FrameElement = {
      id: f.id || uuid(),
      type: "frame",
      title: f.title || "",
      x: frameX,
      y: frameY,
      width: frameWidth,
      height: frameHeight,
      children: [], // WhiteBoard 会根据位置自动管理
      backgroundColor: colorConfig.fill,
      borderColor: colorConfig.stroke,
      borderWidth: 2,
      borderRadius: 8,
      padding: FRAME_PADDING,
      containmentPolicy: "full",
      removalPolicy: "full",
      autoResize: false,
      minWidth: 100,
      minHeight: 60,
      _childIds: childIds, // 保存原始 children ID 列表，用于后续重新计算
    };
    elements.push(frame);
  }

  return elements;
}
