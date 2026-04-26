import React, {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
  lazy,
} from "react";
import { App, Alert, Badge, Empty, Tooltip } from "antd";
import {
  Code,
  Copy,
  Download,
  Eye,
  Maximize2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useDebounce } from "ahooks";
import type { Descendant } from "slate";
import { FullscreenPortal, LazySyntaxHighlighter } from "@tau/shared";
import { captureBlobWithSnapdom } from "@/utils/snapdom-export";
import { copyElementsToClipboard } from "@/utils/clipboardHelpers";
import { useMarkdownContext } from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext";
import type {
  BlockInlineRendererProps,
  BlockPreviewRendererProps,
  BlockRenderer,
} from "@/types/block-preview";
import type {
  ArrowElement,
  BoardElement,
  WhiteBoardRef,
} from "@/components/WhiteBoard";
import { EArrowLineType, EMarkerType } from "@/components/WhiteBoard";

const WhiteBoard = lazy(() => import("@/components/WhiteBoard"));

type WhiteboardLayout = "flow-right" | "flow-down" | "grid";
type WhiteboardTone =
  | "slate"
  | "red"
  | "orange"
  | "amber"
  | "green"
  | "teal"
  | "blue"
  | "indigo"
  | "pink";
type WhiteboardShape = "square" | "rounded" | "pill";
type WhiteboardLine = "solid" | "dashed";
type WhiteboardRoute = "straight" | "curve" | "orthogonal";
type WhiteboardAnchor = "top" | "right" | "bottom" | "left" | "center";
type WhiteboardMarker =
  | "none"
  | "start-arrow"
  | "end-arrow"
  | "both-arrow"
  | "diamond-end"
  | "circle-end";

interface WhiteboardNode {
  id: string;
  text: string;
  kind?: string;
  tone?: WhiteboardTone;
  shape?: WhiteboardShape;
  groupId?: string;
}

interface WhiteboardGroup {
  id: string;
  title: string;
  tone?: WhiteboardTone;
  nodeIds: string[];
}

interface WhiteboardEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  line?: WhiteboardLine;
  route?: WhiteboardRoute;
  marker?: WhiteboardMarker;
  animated?: boolean;
  tone?: WhiteboardTone;
  sourceAnchor?: WhiteboardAnchor;
  targetAnchor?: WhiteboardAnchor;
}

interface WhiteboardDocument {
  title?: string;
  layout: WhiteboardLayout;
  theme?: string;
  groups: WhiteboardGroup[];
  nodes: WhiteboardNode[];
  edges: WhiteboardEdge[];
}

interface ParsedAttributes {
  [key: string]: string | boolean | number;
}

interface ParsedGroupContext {
  groupId: string | null;
  indent: number;
}

const DEFAULT_LAYOUT: WhiteboardLayout = "flow-right";
const DEFAULT_PADDING = 24;
const GROUP_GAP = 84;
const NODE_GAP = 24;
const NODE_MIN_WIDTH = 140;
const NODE_MAX_WIDTH = 320;
const NODE_HEIGHT = 64;
const GRID_COLUMNS = 2;
const DEFAULT_EXPORT_FILENAME = "whiteboard.png";
const INLINE_MIN_HEIGHT = 280;

const TONE_STYLES: Record<
  WhiteboardTone,
  {
    fill: string;
    stroke: string;
    text: string;
    frameBg: string;
    frameBorder: string;
    themeColorId: string;
  }
> = {
  slate: {
    fill: "#F3F4F6",
    stroke: "#6B7280",
    text: "#111827",
    frameBg: "rgba(107, 114, 128, 0.08)",
    frameBorder: "#6B7280",
    themeColorId: "gray",
  },
  red: {
    fill: "#FEE2E2",
    stroke: "#EF4444",
    text: "#7F1D1D",
    frameBg: "rgba(239, 68, 68, 0.08)",
    frameBorder: "#EF4444",
    themeColorId: "error",
  },
  orange: {
    fill: "#FFEDD5",
    stroke: "#F97316",
    text: "#7C2D12",
    frameBg: "rgba(249, 115, 22, 0.08)",
    frameBorder: "#F97316",
    themeColorId: "orange",
  },
  amber: {
    fill: "#FEF3C7",
    stroke: "#F59E0B",
    text: "#78350F",
    frameBg: "rgba(245, 158, 11, 0.08)",
    frameBorder: "#F59E0B",
    themeColorId: "warning",
  },
  green: {
    fill: "#DCFCE7",
    stroke: "#10B981",
    text: "#14532D",
    frameBg: "rgba(16, 185, 129, 0.08)",
    frameBorder: "#10B981",
    themeColorId: "success",
  },
  teal: {
    fill: "#CCFBF1",
    stroke: "#14B8A6",
    text: "#134E4A",
    frameBg: "rgba(20, 184, 166, 0.08)",
    frameBorder: "#14B8A6",
    themeColorId: "cyan",
  },
  blue: {
    fill: "#DBEAFE",
    stroke: "#3B82F6",
    text: "#1E3A8A",
    frameBg: "rgba(59, 130, 246, 0.08)",
    frameBorder: "#3B82F6",
    themeColorId: "primary",
  },
  indigo: {
    fill: "#E0E7FF",
    stroke: "#6366F1",
    text: "#312E81",
    frameBg: "rgba(99, 102, 241, 0.08)",
    frameBorder: "#6366F1",
    themeColorId: "indigo",
  },
  pink: {
    fill: "#FCE7F3",
    stroke: "#EC4899",
    text: "#831843",
    frameBg: "rgba(236, 72, 153, 0.08)",
    frameBorder: "#EC4899",
    themeColorId: "pink",
  },
};

const ROUTE_TO_LINE_TYPE: Record<WhiteboardRoute, EArrowLineType> = {
  straight: EArrowLineType.STRAIGHT,
  curve: EArrowLineType.CURVE,
  orthogonal: EArrowLineType.ORTHOGONAL,
};

const shapeToCornerRadius = (shape?: WhiteboardShape): number => {
  if (shape === "pill") return 999;
  if (shape === "square") return 0;
  return 12;
};

const createTextContent = (text: string): Descendant[] => [
  {
    type: "paragraph",
    children: [{ type: "formatted", text }],
  },
];

const slugify = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/["']/g, "")
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || `node-${Math.random().toString(36).slice(2, 8)}`;
};

const getToneStyle = (tone?: WhiteboardTone) => {
  return TONE_STYLES[tone || "slate"];
};

const estimateTextWidth = (text: string) => {
  let width = 0;
  for (const char of text) {
    width += /[\u4e00-\u9fa5]/.test(char) ? 18 : 9;
  }
  return Math.max(NODE_MIN_WIDTH, Math.min(NODE_MAX_WIDTH, width + 48));
};

const splitByComma = (input: string) => {
  const result: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : (char as '"' | "'");
      current += char;
      continue;
    }
    if (char === "," && !quote) {
      if (current.trim()) result.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
};

const parseAttributes = (raw: string): ParsedAttributes => {
  const trimmed = raw.trim();
  if (!trimmed) return {};

  return splitByComma(trimmed).reduce<ParsedAttributes>((acc, part) => {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) {
      acc[part] = true;
      return acc;
    }

    const key = part.slice(0, separatorIndex).trim();
    const rawValue = part.slice(separatorIndex + 1).trim();
    const unquoted = rawValue.replace(/^['"]|['"]$/g, "");

    if (unquoted === "true") {
      acc[key] = true;
    } else if (unquoted === "false") {
      acc[key] = false;
    } else if (/^-?\d+(\.\d+)?$/.test(unquoted)) {
      acc[key] = Number(unquoted);
    } else {
      acc[key] = unquoted;
    }
    return acc;
  }, {});
};

const extractStatement = (content: string) => {
  const attrStart = content.lastIndexOf("[");
  const attrEnd = content.endsWith("]") ? content.length - 1 : -1;
  if (attrStart === -1 || attrEnd <= attrStart) {
    return {
      body: content.trim(),
      attrs: {} as ParsedAttributes,
    };
  }

  return {
    body: content.slice(0, attrStart).trim(),
    attrs: parseAttributes(content.slice(attrStart + 1, attrEnd)),
  };
};

const normalizeLayout = (value?: string): WhiteboardLayout => {
  if (value === "flow-down" || value === "grid" || value === "flow-right") {
    return value;
  }
  return DEFAULT_LAYOUT;
};

const normalizeTone = (value: unknown): WhiteboardTone | undefined => {
  if (typeof value !== "string") return undefined;
  return value in TONE_STYLES ? (value as WhiteboardTone) : undefined;
};

const normalizeShape = (value: unknown): WhiteboardShape | undefined => {
  if (value === "square" || value === "rounded" || value === "pill") {
    return value;
  }
  return undefined;
};

const normalizeLine = (value: unknown): WhiteboardLine | undefined => {
  return value === "dashed" || value === "solid"
    ? (value as WhiteboardLine)
    : undefined;
};

const normalizeRoute = (value: unknown): WhiteboardRoute | undefined => {
  if (value === "straight" || value === "curve" || value === "orthogonal") {
    return value;
  }
  return undefined;
};

const normalizeMarker = (value: unknown): WhiteboardMarker | undefined => {
  if (
    value === "none" ||
    value === "start-arrow" ||
    value === "end-arrow" ||
    value === "both-arrow" ||
    value === "diamond-end" ||
    value === "circle-end"
  ) {
    return value;
  }
  return undefined;
};

const normalizeAnchor = (value: unknown): WhiteboardAnchor | undefined => {
  if (
    value === "top" ||
    value === "right" ||
    value === "bottom" ||
    value === "left" ||
    value === "center"
  ) {
    return value;
  }
  return undefined;
};

const parseWhiteboardDsl = (code: string): WhiteboardDocument => {
  const document: WhiteboardDocument = {
    layout: DEFAULT_LAYOUT,
    groups: [],
    nodes: [],
    edges: [],
  };

  const nodeIds = new Set<string>();
  let currentGroup: ParsedGroupContext = {
    groupId: null,
    indent: 0,
  };

  const lines = code
    .split("\n")
    .map((line) => line.replace(/\t/g, "  "))
    .filter((line) => line.trim().length > 0);

  for (const line of lines) {
    const indent = line.match(/^\s*/)?.[0].length || 0;
    const trimmed = line.trim();
    const match = trimmed.match(/^([a-z-]+):\s*(.*)$/i);
    if (!match) {
      throw new Error(`无法解析白板语句：${trimmed}`);
    }

    const [, rawType, rawContent] = match;
    const type = rawType.toLowerCase();
    const { body, attrs } = extractStatement(rawContent);

    if (indent <= currentGroup.indent) {
      currentGroup = { groupId: null, indent: 0 };
    }

    if (type === "board") {
      document.title = body;
      continue;
    }

    if (type === "layout") {
      document.layout = normalizeLayout(body);
      continue;
    }

    if (type === "theme") {
      document.theme = body || "default";
      continue;
    }

    if (type === "group") {
      if (currentGroup.groupId && indent > currentGroup.indent) {
        throw new Error("group 不支持嵌套，frame 只能是单层结构");
      }
      const id = String(
        attrs.id || slugify(body || `group-${document.groups.length + 1}`),
      );
      const title = body || String(attrs.text || id);
      document.groups.push({
        id,
        title,
        tone: normalizeTone(attrs.tone),
        nodeIds: [],
      });
      currentGroup = { groupId: id, indent };
      continue;
    }

    if (type === "node" || type === "note") {
      const fallbackText = body || String(attrs.text || attrs.id || "");
      const id = String(attrs.id || slugify(body || fallbackText));
      if (nodeIds.has(id)) {
        throw new Error(`节点 ID 重复：${id}`);
      }
      nodeIds.add(id);
      const text = String(attrs.text || fallbackText || id);
      const node: WhiteboardNode = {
        id,
        text,
        kind: String(attrs.kind || (type === "note" ? "note" : "node")),
        tone: normalizeTone(attrs.tone),
        shape: normalizeShape(attrs.shape),
        groupId: currentGroup.groupId ?? undefined,
      };
      document.nodes.push(node);
      if (currentGroup.groupId) {
        const group = document.groups.find(
          (item) => item.id === currentGroup.groupId,
        );
        group?.nodeIds.push(id);
      }
      continue;
    }

    if (type === "edge") {
      const edgeMatch = body.match(
        /^([^\s]+)\s*(->|<->)\s*([^\s]+)(?:\s+(.+))?$/,
      );
      if (!edgeMatch) {
        throw new Error(`无法解析边：${body}`);
      }
      const [, sourceId, connector, targetId, extraLabel] = edgeMatch;
      const edgeIdBase = `${sourceId}-${connector}-${targetId}-${document.edges.length + 1}`;
      document.edges.push({
        id: slugify(edgeIdBase),
        sourceId,
        targetId,
        label: String(attrs.label || extraLabel || ""),
        line: normalizeLine(attrs.line),
        route: normalizeRoute(attrs.route),
        marker:
          normalizeMarker(attrs.marker) ||
          (connector === "<->" ? "both-arrow" : "end-arrow"),
        animated: Boolean(attrs.animated),
        tone: normalizeTone(attrs.tone),
        sourceAnchor: normalizeAnchor(
          attrs.sourceAnchor || attrs.sourceConnect,
        ),
        targetAnchor: normalizeAnchor(
          attrs.targetAnchor || attrs.targetConnect,
        ),
      });
      continue;
    }

    throw new Error(`不支持的白板语句类型：${type}`);
  }

  for (const edge of document.edges) {
    if (!nodeIds.has(edge.sourceId)) {
      throw new Error(`边的起点不存在：${edge.sourceId}`);
    }
    if (!nodeIds.has(edge.targetId)) {
      throw new Error(`边的终点不存在：${edge.targetId}`);
    }
  }

  return document;
};

const createLayoutForNodes = (
  nodeIds: string[],
  nodeMap: Map<string, WhiteboardNode>,
  layout: WhiteboardLayout,
  startX: number,
  startY: number,
  inheritedTone?: WhiteboardTone,
) => {
  const positions = new Map<
    string,
    {
      x: number;
      y: number;
      width: number;
      height: number;
      tone?: WhiteboardTone;
      shape?: WhiteboardShape;
    }
  >();

  const measuredNodes = nodeIds
    .map((id) => nodeMap.get(id))
    .filter((node): node is WhiteboardNode => Boolean(node))
    .map((node) => ({
      node,
      width: estimateTextWidth(node.text),
      height: NODE_HEIGHT,
      tone: node.tone || inheritedTone || "slate",
      shape: node.shape || "rounded",
    }));

  if (layout === "flow-down") {
    let cursorY = startY;
    for (const item of measuredNodes) {
      positions.set(item.node.id, {
        x: startX,
        y: cursorY,
        width: item.width,
        height: item.height,
        tone: item.tone,
        shape: item.shape,
      });
      cursorY += item.height + NODE_GAP;
    }
    return positions;
  }

  if (layout === "grid") {
    measuredNodes.forEach((item, index) => {
      const column = index % GRID_COLUMNS;
      const row = Math.floor(index / GRID_COLUMNS);
      positions.set(item.node.id, {
        x: startX + column * (NODE_MAX_WIDTH + NODE_GAP),
        y: startY + row * (NODE_HEIGHT + NODE_GAP),
        width: item.width,
        height: item.height,
        tone: item.tone,
        shape: item.shape,
      });
    });
    return positions;
  }

  let cursorX = startX;
  for (const item of measuredNodes) {
    positions.set(item.node.id, {
      x: cursorX,
      y: startY,
      width: item.width,
      height: item.height,
      tone: item.tone,
      shape: item.shape,
    });
    cursorX += item.width + NODE_GAP;
  }
  return positions;
};

const resolveBounds = (
  items: Array<{ x: number; y: number; width: number; height: number }>,
) => {
  const minX = Math.min(...items.map((item) => item.x));
  const minY = Math.min(...items.map((item) => item.y));
  const maxX = Math.max(...items.map((item) => item.x + item.width));
  const maxY = Math.max(...items.map((item) => item.y + item.height));
  return { minX, minY, maxX, maxY };
};

interface TopLevelCursor {
  x: number;
  y: number;
  column: number;
  rowHeight: number;
}

const advanceTopLevelCursor = (
  cursor: TopLevelCursor,
  layout: WhiteboardLayout,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
) => {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  if (layout === "flow-right") {
    cursor.x += width + GROUP_GAP;
    return;
  }

  if (layout === "flow-down") {
    cursor.y += height + GROUP_GAP;
    return;
  }

  cursor.rowHeight = Math.max(cursor.rowHeight, height);
  if (cursor.column >= GRID_COLUMNS - 1) {
    cursor.x = 0;
    cursor.y += cursor.rowHeight + GROUP_GAP;
    cursor.column = 0;
    cursor.rowHeight = 0;
    return;
  }

  cursor.x += width + GROUP_GAP;
  cursor.column += 1;
};

const createFrameElement = (
  group: WhiteboardGroup,
  nodeRects: Array<{ x: number; y: number; width: number; height: number }>,
  children: BoardElement[],
): BoardElement => {
  const toneStyle = getToneStyle(group.tone);
  const bounds = resolveBounds(nodeRects);
  return {
    id: `group-${group.id}`,
    type: "frame",
    x: bounds.minX - DEFAULT_PADDING,
    y: bounds.minY - DEFAULT_PADDING,
    width: bounds.maxX - bounds.minX + DEFAULT_PADDING * 2,
    height: bounds.maxY - bounds.minY + DEFAULT_PADDING * 2,
    title: group.title,
    backgroundColor: toneStyle.frameBg,
    borderColor: toneStyle.frameBorder,
    borderWidth: 2,
    borderRadius: 16,
    padding: DEFAULT_PADDING,
    containmentPolicy: "partial",
    removalPolicy: "partial",
    autoResize: false,
    minWidth: 240,
    minHeight: 160,
    children,
    resizable: false,
  };
};

const resolveEdgeMarkers = (marker?: WhiteboardMarker) => {
  switch (marker) {
    case "start-arrow":
      return {
        sourceMarker: EMarkerType.Arrow,
        targetMarker: EMarkerType.None,
      };
    case "both-arrow":
      return {
        sourceMarker: EMarkerType.Arrow,
        targetMarker: EMarkerType.Arrow,
      };
    case "diamond-end":
      return {
        sourceMarker: EMarkerType.None,
        targetMarker: EMarkerType.Diamond,
      };
    case "circle-end":
      return {
        sourceMarker: EMarkerType.None,
        targetMarker: EMarkerType.Circle,
      };
    case "none":
      return {
        sourceMarker: EMarkerType.None,
        targetMarker: EMarkerType.None,
      };
    case "end-arrow":
    default:
      return {
        sourceMarker: EMarkerType.None,
        targetMarker: EMarkerType.Arrow,
      };
  }
};

const resolveConnectIds = (
  from: { x: number; y: number; width: number; height: number },
  to: { x: number; y: number; width: number; height: number },
  preferred?: {
    sourceAnchor?: WhiteboardAnchor;
    targetAnchor?: WhiteboardAnchor;
  },
) => {
  const fromCenter = {
    x: from.x + from.width / 2,
    y: from.y + from.height / 2,
  };
  const toCenter = {
    x: to.x + to.width / 2,
    y: to.y + to.height / 2,
  };

  if (preferred?.sourceAnchor && preferred?.targetAnchor) {
    return {
      sourceConnectId: preferred.sourceAnchor,
      targetConnectId: preferred.targetAnchor,
      points: [fromCenter, toCenter],
    };
  }

  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      sourceConnectId: dx >= 0 ? "right" : "left",
      targetConnectId: dx >= 0 ? "left" : "right",
      points: [fromCenter, toCenter],
    };
  }

  return {
    sourceConnectId: dy >= 0 ? "bottom" : "top",
    targetConnectId: dy >= 0 ? "top" : "bottom",
    points: [fromCenter, toCenter],
  };
};

const getRepeatedEdgeAnchors = (
  layout: WhiteboardLayout,
  index: number,
): {
  sourceAnchor: WhiteboardAnchor;
  targetAnchor: WhiteboardAnchor;
} | null => {
  if (index <= 0) return null;

  if (layout === "flow-right") {
    const variants: Array<{
      sourceAnchor: WhiteboardAnchor;
      targetAnchor: WhiteboardAnchor;
    }> = [
      { sourceAnchor: "bottom", targetAnchor: "top" },
      { sourceAnchor: "top", targetAnchor: "bottom" },
      { sourceAnchor: "right", targetAnchor: "left" },
    ];
    return variants[(index - 1) % variants.length];
  }

  if (layout === "flow-down") {
    const variants: Array<{
      sourceAnchor: WhiteboardAnchor;
      targetAnchor: WhiteboardAnchor;
    }> = [
      { sourceAnchor: "right", targetAnchor: "left" },
      { sourceAnchor: "left", targetAnchor: "right" },
      { sourceAnchor: "bottom", targetAnchor: "top" },
    ];
    return variants[(index - 1) % variants.length];
  }

  const variants: Array<{
    sourceAnchor: WhiteboardAnchor;
    targetAnchor: WhiteboardAnchor;
  }> = [
    { sourceAnchor: "right", targetAnchor: "left" },
    { sourceAnchor: "bottom", targetAnchor: "top" },
    { sourceAnchor: "top", targetAnchor: "bottom" },
    { sourceAnchor: "left", targetAnchor: "right" },
  ];
  return variants[(index - 1) % variants.length];
};

const convertWhiteboardToBoard = (
  document: WhiteboardDocument,
): BoardElement[] => {
  const nodeMap = new Map(document.nodes.map((node) => [node.id, node]));
  const positionedNodes = new Map<
    string,
    {
      x: number;
      y: number;
      width: number;
      height: number;
      tone?: WhiteboardTone;
      shape?: WhiteboardShape;
    }
  >();
  const nodeElements = new Map<string, BoardElement>();
  const elements: BoardElement[] = [];
  const groupIds = new Set(document.groups.map((group) => group.id));
  const ungroupedNodeIds = document.nodes
    .filter((node) => !node.groupId || !groupIds.has(node.groupId))
    .map((node) => node.id);

  const topLevelCursor: TopLevelCursor = {
    x: 0,
    y: 0,
    column: 0,
    rowHeight: 0,
  };

  if (ungroupedNodeIds.length > 0) {
    const layouts = createLayoutForNodes(
      ungroupedNodeIds,
      nodeMap,
      document.layout,
      topLevelCursor.x,
      topLevelCursor.y,
    );
    layouts.forEach((value, key) => positionedNodes.set(key, value));
    if (layouts.size > 0) {
      const bounds = resolveBounds(Array.from(layouts.values()));
      advanceTopLevelCursor(topLevelCursor, document.layout, bounds);
    }
  }

  for (const group of document.groups) {
    const groupLayouts = createLayoutForNodes(
      group.nodeIds,
      nodeMap,
      document.layout,
      topLevelCursor.x,
      topLevelCursor.y,
      group.tone,
    );

    groupLayouts.forEach((value, key) => positionedNodes.set(key, value));
    if (groupLayouts.size === 0) {
      continue;
    }

    const nodeRects = Array.from(groupLayouts.values());
    const bounds = resolveBounds(nodeRects);
    advanceTopLevelCursor(topLevelCursor, document.layout, bounds);
  }

  document.nodes.forEach((node) => {
    const rect = positionedNodes.get(node.id);
    if (!rect) return;
    const toneStyle = getToneStyle(rect.tone);
    nodeElements.set(node.id, {
      id: `node-${node.id}`,
      type: "geometry",
      geometryType: "rectangle",
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      fill: toneStyle.fill,
      fillOpacity: 1,
      stroke: toneStyle.stroke,
      strokeWidth: 2,
      strokeOpacity: 1,
      paths: ["M 0 0 H 1 V 1 H 0 Z"],
      extraInfo: {
        cornerRadius: shapeToCornerRadius(rect.shape),
      },
      text: {
        align: "center",
        content: createTextContent(node.text),
      },
      resizable: false,
      autoHeight: false,
    });
  });

  document.groups.forEach((group) => {
    const childNodeRects = group.nodeIds
      .map((nodeId) => positionedNodes.get(nodeId))
      .filter(
        (
          rect,
        ): rect is {
          x: number;
          y: number;
          width: number;
          height: number;
          tone?: WhiteboardTone;
          shape?: WhiteboardShape;
        } => Boolean(rect),
      );
    if (childNodeRects.length === 0) return;

    const groupChildren = group.nodeIds
      .map((nodeId) => nodeElements.get(nodeId))
      .filter((element): element is BoardElement => Boolean(element));

    elements.push(createFrameElement(group, childNodeRects, groupChildren));
  });

  document.nodes
    .filter((node) => !node.groupId || !groupIds.has(node.groupId))
    .forEach((node) => {
      const nodeElement = nodeElements.get(node.id);
      if (nodeElement) {
        elements.push(nodeElement);
      }
    });

  const edgePairCounters = new Map<string, number>();

  document.edges.forEach((edge) => {
    const fromRect = positionedNodes.get(edge.sourceId);
    const toRect = positionedNodes.get(edge.targetId);
    if (!fromRect || !toRect) return;
    const pairKey = `${edge.sourceId}->${edge.targetId}`;
    const currentPairIndex = edgePairCounters.get(pairKey) || 0;
    edgePairCounters.set(pairKey, currentPairIndex + 1);

    const repeatedAnchors =
      edge.sourceAnchor && edge.targetAnchor
        ? null
        : getRepeatedEdgeAnchors(document.layout, currentPairIndex);

    const connectInfo = resolveConnectIds(fromRect, toRect, {
      sourceAnchor: edge.sourceAnchor || repeatedAnchors?.sourceAnchor,
      targetAnchor: edge.targetAnchor || repeatedAnchors?.targetAnchor,
    });
    const markers = resolveEdgeMarkers(edge.marker);
    const toneStyle = getToneStyle(edge.tone || "blue");
    const arrow: ArrowElement = {
      id: `edge-${edge.id}`,
      type: "arrow",
      lineType: ROUTE_TO_LINE_TYPE[edge.route || "orthogonal"],
      source: {
        marker: markers.sourceMarker,
        bindId: `node-${edge.sourceId}`,
        connectId: connectInfo.sourceConnectId,
      },
      target: {
        marker: markers.targetMarker,
        bindId: `node-${edge.targetId}`,
        connectId: connectInfo.targetConnectId,
      },
      points: connectInfo.points,
      lineWidth: 2,
      dashed: edge.line === "dashed",
      animated: edge.animated,
      animationSpeed: edge.animated ? 3 : undefined,
      themeColorId: toneStyle.themeColorId,
      description: edge.label ? createTextContent(edge.label) : undefined,
      resizable: false,
    };
    elements.push(arrow);
  });

  return elements;
};

const waitDoubleRaf = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  link.click();
  URL.revokeObjectURL(url);
};

const compileWhiteboard = (code: string) => {
  const document = parseWhiteboardDsl(code);
  const elements = convertWhiteboardToBoard(document);
  return {
    document,
    elements,
  };
};

interface WhiteboardCanvasProps {
  code: string;
  isGenerating?: boolean;
  fillContainer?: boolean;
}

interface CompiledWhiteboardState {
  document: WhiteboardDocument | null;
  elements: BoardElement[];
  error: string | null;
}

const getFitPadding = (options: {
  fillContainer: boolean;
  isFullscreen: boolean;
}) => {
  if (options.isFullscreen) {
    return 80;
  }
  return options.fillContainer ? 64 : 32;
};

const WhiteboardLoadingIndicator: React.FC<{
  label?: string;
  absolute?: boolean;
}> = ({ label, absolute = false }) => {
  const containerClassName = absolute
    ? "absolute inset-0 z-10 flex items-center justify-center"
    : "flex h-full w-full items-center justify-center";

  return (
    <div className={containerClassName}>
      <div className="flex flex-col items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              className="h-3 w-3 rounded-full bg-gray-400/90 dark:bg-gray-500/90"
              style={{
                animation: "whiteboard-loading-pulse 0.9s ease-in-out infinite",
                animationDelay: `${index * 0.12}s`,
              }}
            />
          ))}
        </div>
        {label ? <span>{label}</span> : null}
        <style>
          {`
            @keyframes whiteboard-loading-pulse {
              0%, 100% {
                opacity: 0.35;
                transform: scale(0.72);
              }
              50% {
                opacity: 1;
                transform: scale(1);
              }
            }
          `}
        </style>
      </div>
    </div>
  );
};

const WhiteboardCanvas = memo(
  ({
    code,
    isGenerating = false,
    fillContainer = false,
  }: WhiteboardCanvasProps) => {
    const { message } = App.useApp();
    const { isDark } = useMarkdownContext();
    const whiteboardRef = useRef<WhiteBoardRef>(null);
    const exportRef = useRef<HTMLDivElement>(null);
    const fullscreenExportRef = useRef<HTMLDivElement>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showSource, setShowSource] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const lastStableCompiledRef = useRef<CompiledWhiteboardState | null>(null);

    const debouncedCode = useDebounce(code, { wait: 300 });

    const compiled = useMemo<CompiledWhiteboardState>(() => {
      if (!debouncedCode.trim()) {
        return {
          document: null,
          elements: [] as BoardElement[],
          error: null as string | null,
        };
      }
      try {
        const result = compileWhiteboard(debouncedCode);
        return {
          ...result,
          error: null,
        };
      } catch (error) {
        return {
          document: null,
          elements: [] as BoardElement[],
          error: error instanceof Error ? error.message : "白板解析失败",
        };
      }
    }, [debouncedCode]);

    useEffect(() => {
      if (!compiled.error) {
        lastStableCompiledRef.current = compiled;
        return;
      }

      if (!isGenerating) {
        lastStableCompiledRef.current = null;
      }
    }, [compiled, isGenerating]);

    const renderState = useMemo(() => {
      if (!compiled.error) {
        return {
          ...compiled,
          isFallbackWhileGenerating: false,
        };
      }

      if (isGenerating) {
        const fallback = lastStableCompiledRef.current;
        if (fallback) {
          return {
            ...fallback,
            isFallbackWhileGenerating: true,
          };
        }

        return {
          document: null,
          elements: [] as BoardElement[],
          error: null,
          isFallbackWhileGenerating: true,
        };
      }

      return {
        ...compiled,
        isFallbackWhileGenerating: false,
      };
    }, [compiled, isGenerating]);

    const fitPadding = useMemo(
      () => getFitPadding({ fillContainer, isFullscreen }),
      [fillContainer, isFullscreen],
    );
    const shouldFillContainer = fillContainer || isFullscreen;

    useEffect(() => {
      if (!renderState.elements.length || showSource) return;
      const timer = window.setTimeout(() => {
        whiteboardRef.current?.fitAllElements(fitPadding, false);
      }, 80);
      return () => window.clearTimeout(timer);
    }, [fitPadding, renderState.elements, showSource]);

    useEffect(() => {
      if (showSource || !renderState.elements.length) return;

      const target = isFullscreen
        ? fullscreenExportRef.current
        : exportRef.current;
      if (!target) return;

      let rafId = 0;
      let lastWidth = 0;
      let lastHeight = 0;

      const scheduleFit = () => {
        if (rafId) {
          cancelAnimationFrame(rafId);
        }
        rafId = requestAnimationFrame(() => {
          whiteboardRef.current?.fitAllElements(fitPadding, false);
        });
      };

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const width = Math.round(entry.contentRect.width);
        const height = Math.round(entry.contentRect.height);
        if (!width || !height) return;
        if (width === lastWidth && height === lastHeight) return;
        lastWidth = width;
        lastHeight = height;
        scheduleFit();
      });

      observer.observe(target);
      scheduleFit();

      return () => {
        observer.disconnect();
        if (rafId) {
          cancelAnimationFrame(rafId);
        }
      };
    }, [fitPadding, isFullscreen, renderState.elements, showSource]);

    const handleCopy = async () => {
      if (!renderState.elements.length) {
        message.error("没有可复制的白板内容");
        return;
      }

      setIsCopying(true);
      try {
        await copyElementsToClipboard(renderState.elements);
      } finally {
        setIsCopying(false);
      }
    };

    const handleExport = async () => {
      const exportElement = isFullscreen
        ? fullscreenExportRef.current
        : exportRef.current;
      if (!exportElement || !renderState.elements.length) {
        message.error("没有可导出的白板内容");
        return;
      }

      setIsExporting(true);
      try {
        whiteboardRef.current?.fitAllElements(fitPadding, false);
        await waitDoubleRaf();
        const blob = await captureBlobWithSnapdom(exportElement, {
          dpr: window.devicePixelRatio || 2,
          type: "png",
          quality: 0.95,
        });
        downloadBlob(
          blob,
          `${renderState.document?.title || DEFAULT_EXPORT_FILENAME}`.replace(
            /[\\/:*?"<>|]/g,
            "_",
          ),
        );
        message.success("白板图片导出成功");
      } catch (error) {
        console.error("导出白板失败:", error);
        message.error("导出失败，请稍后重试");
      } finally {
        setIsExporting(false);
      }
    };

    const renderBoard = (ref?: React.RefObject<HTMLDivElement | null>) => {
      if (renderState.error) {
        return (
          <Alert
            type="error"
            showIcon
            message="白板渲染错误"
            description={renderState.error}
          />
        );
      }

      if (!renderState.elements.length) {
        return (
          <div className="flex h-full min-h-[320px] items-center justify-center">
            {renderState.isFallbackWhileGenerating ? (
              <WhiteboardLoadingIndicator label="白板生成中，等待完整内容" />
            ) : (
              <Empty description="等待白板内容" />
            )}
          </div>
        );
      }

      return (
        <div
          ref={ref}
          className={`relative overflow-hidden rounded-b-lg ${
            shouldFillContainer
              ? "flex flex-1 min-h-0 flex-col"
              : "flex min-h-0 w-full flex-col"
          }`}
          style={{
            background: isDark ? "#0f172a" : "#ffffff",
            minHeight: shouldFillContainer ? undefined : INLINE_MIN_HEIGHT,
          }}
        >
          {isGenerating && (
            <div className="absolute right-3 top-3 z-10 rounded-full bg-black/65 px-2 py-1 text-xs text-white">
              {renderState.isFallbackWhileGenerating
                ? "生成中（显示最近有效结果）"
                : "生成中"}
            </div>
          )}
          <Suspense fallback={<WhiteboardLoadingIndicator absolute />}>
            <div
              className={shouldFillContainer ? "h-full w-full" : "w-full"}
              style={
                !shouldFillContainer ? { height: INLINE_MIN_HEIGHT } : undefined
              }
            >
              <WhiteBoard
                ref={whiteboardRef}
                initData={
                  renderState.elements as BoardElement[] & {
                    presentationSequences?: never[];
                  }
                }
                readonly={true}
                showSidebar={false}
                showToolbar={false}
                showAttributeSetter={false}
                showStatusBar={false}
                className="h-full"
                style={{
                  background: isDark ? "#0f172a" : "#ffffff",
                }}
              />
            </div>
          </Suspense>
        </div>
      );
    };

    const content = showSource ? (
      <div
        className="flex-1 overflow-auto bg-gray-50 p-3 dark:bg-neutral-900"
        style={
          !shouldFillContainer ? { minHeight: INLINE_MIN_HEIGHT } : undefined
        }
      >
        <LazySyntaxHighlighter language="text" isDark={isDark}>
          {code}
        </LazySyntaxHighlighter>
      </div>
    ) : (
      renderBoard(exportRef)
    );

    return (
      <>
        <div
          className={`flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900 ${
            fillContainer ? "h-full min-h-0" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Whiteboard
              </span>
              <Badge
                count={renderState.document?.layout || DEFAULT_LAYOUT}
                color="#3b82f6"
                style={{ fontSize: 11 }}
              />
            </div>
            <div className="flex items-center gap-2">
              <Tooltip title="缩小">
                <button
                  className="inline-flex items-center rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-neutral-700 dark:hover:text-white"
                  onClick={() => whiteboardRef.current?.zoomOut()}
                  disabled={showSource}
                >
                  <ZoomOut size={16} />
                </button>
              </Tooltip>
              <Tooltip title="放大">
                <button
                  className="inline-flex items-center rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-neutral-700 dark:hover:text-white"
                  onClick={() => whiteboardRef.current?.zoomIn()}
                  disabled={showSource}
                >
                  <ZoomIn size={16} />
                </button>
              </Tooltip>
              <Tooltip title="适配内容">
                <button
                  className="inline-flex items-center rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-neutral-700 dark:hover:text-white"
                  onClick={() =>
                    whiteboardRef.current?.fitAllElements(fitPadding, true)
                  }
                  disabled={showSource}
                >
                  <Eye size={16} />
                </button>
              </Tooltip>
              <Tooltip title="复制到白板">
                <button
                  className="inline-flex items-center rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-neutral-700 dark:hover:text-white"
                  onClick={handleCopy}
                  disabled={showSource || isCopying}
                >
                  <Copy size={16} />
                </button>
              </Tooltip>
              <Tooltip title="导出图片">
                <button
                  className="inline-flex items-center rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-neutral-700 dark:hover:text-white"
                  onClick={handleExport}
                  disabled={showSource || isExporting}
                >
                  <Download size={16} />
                </button>
              </Tooltip>
              <Tooltip title={showSource ? "查看白板" : "查看源码"}>
                <button
                  className="inline-flex items-center rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-neutral-700 dark:hover:text-white"
                  onClick={() => setShowSource((value) => !value)}
                >
                  {showSource ? <Eye size={16} /> : <Code size={16} />}
                </button>
              </Tooltip>
              <Tooltip title="全屏">
                <button
                  className="inline-flex items-center rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-neutral-700 dark:hover:text-white"
                  onClick={() => setIsFullscreen(true)}
                >
                  <Maximize2 size={16} />
                </button>
              </Tooltip>
            </div>
          </div>
          <div className={fillContainer ? "flex min-h-0 flex-1" : ""}>
            {content}
          </div>
        </div>
        {isFullscreen && (
          <FullscreenPortal
            title={renderState.document?.title || "Whiteboard"}
            onClose={() => setIsFullscreen(false)}
            hideHeader
          >
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
              <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800">
                <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {renderState.document?.title || "Whiteboard"}
                </div>
                <div className="flex items-center gap-2">
                  <Tooltip title="缩小">
                    <button
                      className="inline-flex items-center rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-neutral-700 dark:hover:text-white"
                      onClick={() => whiteboardRef.current?.zoomOut()}
                    >
                      <ZoomOut size={16} />
                    </button>
                  </Tooltip>
                  <Tooltip title="放大">
                    <button
                      className="inline-flex items-center rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-neutral-700 dark:hover:text-white"
                      onClick={() => whiteboardRef.current?.zoomIn()}
                    >
                      <ZoomIn size={16} />
                    </button>
                  </Tooltip>
                  <Tooltip title="适配内容">
                    <button
                      className="inline-flex items-center rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-neutral-700 dark:hover:text-white"
                      onClick={() =>
                        whiteboardRef.current?.fitAllElements(fitPadding, true)
                      }
                    >
                      <Eye size={16} />
                    </button>
                  </Tooltip>
                  <Tooltip title="关闭">
                    <button
                      className="inline-flex items-center rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-neutral-700 dark:hover:text-white"
                      onClick={() => setIsFullscreen(false)}
                    >
                      <X size={16} />
                    </button>
                  </Tooltip>
                </div>
              </div>
              <div className="flex flex-1 min-h-0 overflow-hidden">
                {renderBoard(fullscreenExportRef)}
              </div>
            </div>
          </FullscreenPortal>
        )}
      </>
    );
  },
);

WhiteboardCanvas.displayName = "WhiteboardCanvas";

const WhiteboardInlineRenderer: React.FC<BlockInlineRendererProps> = ({
  block,
}) => {
  return (
    <WhiteboardCanvas
      code={block.content}
      isGenerating={Boolean(block.metadata.isGenerating)}
    />
  );
};

const WhiteboardPreviewRenderer: React.FC<BlockPreviewRendererProps> = ({
  block,
}) => {
  return (
    <WhiteboardCanvas
      code={block.content}
      isGenerating={Boolean(block.metadata.isGenerating)}
      fillContainer
    />
  );
};

const extractMetadata = (content: string) => {
  try {
    const document = parseWhiteboardDsl(content);
    const title = document.title || "Whiteboard";
    return {
      title,
      description: `${document.nodes.length} 个节点 · ${document.edges.length} 条连接`,
      size: `${(content.length / 1024).toFixed(1)} KB`,
    };
  } catch {
    return {
      title: "Whiteboard",
      description: "白板 DSL",
      size: `${(content.length / 1024).toFixed(1)} KB`,
    };
  }
};

export const whiteboardBlockRenderer: BlockRenderer = {
  type: "whiteboard",
  inlineMode: "expanded",
  supportsStreaming: true,
  canRender: (block) =>
    block.type === "whiteboard" || block.metadata.language === "whiteboard",
  renderInline: (props) => <WhiteboardInlineRenderer {...props} />,
  renderPreview: (props) => <WhiteboardPreviewRenderer {...props} />,
  extractMetadata,
};
