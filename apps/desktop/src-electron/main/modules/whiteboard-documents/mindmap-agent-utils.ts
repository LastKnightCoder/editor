import { createHash } from "node:crypto";
import { canonicalContractJson } from "@tau/db-schema/content-contracts";
import type { ContentNode, WhiteboardAnchor } from "@tau/collaboration";
import type { agentContracts } from "./agent";

export type Contracts = Awaited<ReturnType<typeof agentContracts>>;
export type Operation = Record<string, unknown>;
export type Outline = { text: ContentNode[]; children: Outline[] };
export type Placement = {
  parent: { kind: "page" | "element"; id: string };
  direction: "left" | "right";
} & WhiteboardAnchor;
export const anchor = (beforeId?: string, afterId?: string): WhiteboardAnchor =>
  beforeId !== undefined ? { beforeId } : afterId !== undefined ? { afterId } : {};
export const hash = (value: unknown) =>
  createHash("sha256").update(canonicalContractJson(value)).digest("hex");
export const equal = (a: unknown, b: unknown) =>
  canonicalContractJson(a ?? null) === canonicalContractJson(b ?? null);
export const plainText = (nodes: readonly ContentNode[]): string =>
  nodes
    .map(node => (typeof node.text === "string" ? node.text : plainText(node.children ?? [])))
    .join("");
export const stripIdentity = (node: ContentNode): ContentNode => {
  const rest = { ...node };
  delete rest.collabId;
  return { ...rest, ...(node.children ? { children: node.children.map(stripIdentity) } : {}) };
};
