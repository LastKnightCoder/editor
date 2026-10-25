import type { WhiteboardElementContract } from "@tau/db-schema/content-contracts";
import { WHITEBOARD_LIMITS } from "./model-limits";
import type {
  WhiteboardParent,
  WhiteboardPlacement,
  WhiteboardRecoveryReason,
} from "./whiteboard-types";

export interface WhiteboardRouteNode {
  placement: WhiteboardPlacement;
  contract: WhiteboardElementContract;
}
export interface WhiteboardRouting {
  parents: Map<string, WhiteboardParent | null>;
  recovered: Map<string, WhiteboardRecoveryReason>;
  pages: Map<string, string | null>;
  depths: Map<string, number>;
}
export const whiteboardParentKey = (parent: WhiteboardParent): string =>
  `${parent.kind}:${parent.id}`;
export const sameWhiteboardParent = (left: WhiteboardParent, right: WhiteboardParent): boolean =>
  left.kind === right.kind && left.id === right.id;

export function canContainWhiteboardElement(
  parent: WhiteboardElementContract,
  child: WhiteboardElementContract
): boolean {
  return (
    child.structure.canBeContained &&
    (parent.structure.container === "free" ||
      (parent.structure.container === "layout" && child.structure.joins.includes("layout")))
  );
}

/** 只修正投影父图；悬挂、环与并发超深不能成为接收端的隐式写操作。 */
export function projectWhiteboardRouting(
  nodes: ReadonlyMap<string, WhiteboardRouteNode>,
  livePages: ReadonlySet<string>
): WhiteboardRouting {
  const parents = new Map<string, WhiteboardParent | null>();
  const recovered = new Map<string, WhiteboardRecoveryReason>();
  const ids = [...nodes.keys()].sort();
  for (const id of ids) {
    const node = nodes.get(id)!;
    const parent = node.placement.parent;
    if (parent.kind === "page" ? !livePages.has(parent.id) : !nodes.has(parent.id)) {
      parents.set(id, null);
      recovered.set(id, "parent-unavailable");
    } else if (
      parent.kind === "element" &&
      !canContainWhiteboardElement(nodes.get(parent.id)!.contract, node.contract)
    ) {
      parents.set(id, null);
      recovered.set(id, "containment");
    } else parents.set(id, parent);
  }
  const visited = new Set<string>();
  for (const id of ids) {
    const path: string[] = [],
      positions = new Map<string, number>();
    let current: string | null = id;
    while (current !== null && !visited.has(current)) {
      const index = positions.get(current);
      if (index !== undefined) {
        const cut = path.slice(index).sort()[0];
        parents.set(cut, null);
        recovered.set(cut, "cycle");
        break;
      }
      positions.set(current, path.length);
      path.push(current);
      const parent: WhiteboardParent | null = parents.get(current) ?? null;
      current = parent?.kind === "element" ? parent.id : null;
    }
    path.forEach(node => visited.add(node));
  }
  const depths = new Map<string, number>();
  for (const id of ids) {
    const path: string[] = [];
    let current: string | null = id;
    while (current !== null && !depths.has(current)) {
      path.push(current);
      const parent: WhiteboardParent | null = parents.get(current) ?? null;
      current = parent?.kind === "element" ? parent.id : null;
    }
    let depth = current === null ? 0 : depths.get(current)!;
    for (const node of path.reverse()) {
      if (++depth > WHITEBOARD_LIMITS.payloadDepth) {
        parents.set(node, null);
        recovered.set(node, "depth");
        depth = 1;
      }
      depths.set(node, depth);
    }
  }
  const pages = new Map<string, string | null>();
  for (const id of ids) {
    const path: string[] = [];
    let current = id,
      page: string | null = null;
    while (!pages.has(current)) {
      path.push(current);
      const parent = parents.get(current);
      if (!parent) {
        const fallback = nodes.get(current)!.placement.fallbackPageId;
        page = livePages.has(fallback) ? fallback : null;
        break;
      }
      if (parent.kind === "page") {
        page = parent.id;
        break;
      }
      current = parent.id;
    }
    if (pages.has(current)) page = pages.get(current)!;
    path.forEach(node => pages.set(node, page));
  }
  return { parents, recovered, pages, depths };
}
