import { Descendant } from "slate";

export interface MindMapNodeData {
  id: string;
  text: Descendant[];
  direction?: "left" | "right";
  isLeftFold?: boolean;
  isRightFold?: boolean;
  children?: MindMapNodeData[];
  meta?: Record<string, unknown>;
}

export interface FlattenedMindMapNode {
  node: MindMapNodeData;
  level: number;
  parentId?: string;
}
