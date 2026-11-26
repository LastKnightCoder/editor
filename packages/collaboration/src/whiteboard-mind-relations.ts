import type { WhiteboardModel } from "./whiteboard-model";
import type { WhiteboardElementSnapshot, WhiteboardSnapshot } from "./whiteboard-types";

/** 失效联系线只退出可见投影，保留池中的身份和正文仍供撤销使用。 */
export function inactiveMindRelationIds(
  model: WhiteboardModel,
  snapshot: WhiteboardSnapshot
): ReadonlySet<string> {
  const inactive = new Set<string>();
  const mindIdentities = new Map<string, boolean>();
  const isMind = (id: string) => {
    const cached = mindIdentities.get(id);
    if (cached !== undefined) return cached;
    const identity = model.readElementIdentity(id, { includeRemoved: true });
    const contract = identity && model.contracts.get(identity.contractId);
    const value = contract?.owner === "host.whiteboard" && identity?.type === "mind-node";
    mindIdentities.set(id, value);
    return value;
  };
  const scan = (roots: readonly WhiteboardElementSnapshot[]) => {
    const nodes: WhiteboardElementSnapshot[] = [];
    const live = new Set<string>();
    const visit = (node: WhiteboardElementSnapshot) => {
      nodes.push(node);
      live.add(node.id);
      node.children.forEach(visit);
    };
    roots.forEach(visit);
    for (const node of nodes) {
      if (
        node.type !== "arrow" ||
        model.contracts.get(node.contractId)?.owner !== "host.whiteboard"
      )
        continue;
      const ends = [node.data.source, node.data.target].map(end =>
        end && typeof end === "object" && "bindId" in end && typeof end.bindId === "string"
          ? end.bindId
          : undefined
      );
      const [source, target] = ends;
      if (
        source &&
        target &&
        isMind(source) &&
        isMind(target) &&
        (!live.has(source) || !live.has(target))
      )
        inactive.add(node.id);
    }
  };
  for (const page of snapshot.pages) scan([...page.children, ...page.recovery]);
  scan(snapshot.recovery);
  return inactive;
}
