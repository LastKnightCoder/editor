import type Board from "../Board";
import type { BoardElement } from "../types/element";

export function projectArrow(
  board: Board,
  node: BoardElement,
  find: (id: string) => BoardElement | undefined
): BoardElement {
  const points = [...(node.points ?? [])];
  for (const [key, at] of [
    ["source", 0],
    ["target", points.length - 1],
  ] as const) {
    const end = node[key],
      target = end?.bindId ? find(end.bindId) : undefined;
    const point = target && board.getArrowBindPoint(target, end.connectId, end.customOffset);
    if (point && at >= 0) points[at] = point;
  }
  return JSON.stringify(points) === JSON.stringify(node.points) ? node : { ...node, points };
}

export function projectArrowTree(
  board: Board,
  children: BoardElement[],
  eligible: (node: BoardElement) => boolean
): BoardElement[] {
  const index = new Map<string, BoardElement>();
  let arrows = false;
  const collect = (nodes: BoardElement[]) => {
    for (const node of nodes) {
      index.set(node.id, node);
      if (eligible(node)) arrows = true;
      if (node.children?.length) collect(node.children);
    }
  };
  collect(children);
  if (!arrows) return children;
  const connect = (node: BoardElement): BoardElement => {
    if (eligible(node)) return projectArrow(board, node, id => index.get(id));
    if (!node.children?.length) return node;
    const next = node.children.map(connect);
    return next.every((child, i) => child === node.children?.[i])
      ? node
      : { ...node, children: next };
  };
  return children.map(connect);
}
