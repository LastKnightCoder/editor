import type {
  ContentNode,
  WhiteboardElementSnapshot,
  WhiteboardGeometry,
} from "@tau/collaboration";

export interface AgentBoardRequest {
  owner: string;
  requestId: string;
  pageId: string;
  operations: Record<string, unknown>[];
  domain?: "mindmap";
  preconditions?: import("./whiteboard-mindmap").MindPrecondition[];
}

export function pageElements(
  children: readonly WhiteboardElementSnapshot[]
): WhiteboardElementSnapshot[] {
  return children.flatMap(node => [node, ...pageElements(node.children)]);
}

export function simpleLabel(node: WhiteboardElementSnapshot) {
  if (node.type === "frame" || node.type === "column")
    return typeof node.data.title === "string" ? node.data.title : "";
  if (node.entity || !Array.isArray(node.body) || node.body.length !== 1) return undefined;
  const paragraph: ContentNode = node.body[0];
  if (paragraph.type !== "paragraph" || paragraph.children?.length !== 1) return undefined;
  const leaf = paragraph.children[0];
  return typeof leaf.text === "string" ? leaf.text : undefined;
}

export function endpointId(value: unknown): string | undefined {
  return value && typeof value === "object" && "bindId" in value && typeof value.bindId === "string"
    ? value.bindId
    : undefined;
}

export const coordKeys = ["x", "y", "width", "height", "rotation"] as const;
export function readGeometry(value: unknown): WhiteboardGeometry {
  if (!value || typeof value !== "object") throw new Error("缺少元素几何信息");
  function coordinate(record: object, key: keyof WhiteboardGeometry): number {
    const n: unknown = Reflect.get(record, key);
    if (typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 1e9)
      throw new Error("无效的元素几何信息");
    return n;
  }
  const x = coordinate(value, "x"),
    y = coordinate(value, "y"),
    width = coordinate(value, "width"),
    height = coordinate(value, "height"),
    rotation = coordinate(value, "rotation");
  if (width < 0 || height < 0) throw new Error("元素尺寸无效");
  return { x, y, width, height, rotation };
}

export interface BoardAgentActivity {
  owner: string;
  name: string;
  presence: import("@tau/collaboration").WhiteboardPresence;
}
export interface BoardAgentPeers {
  sequence: number;
  peers: readonly import("@tau/collaboration").WhiteboardPeer[];
}
