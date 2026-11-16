import { canvasFields } from "./builtins";
import { buildHandwriteElement } from "../extensions/creators/handwrite";
import type { WhiteboardElementSnapshot } from "@tau/collaboration";
import { ColumnUtil } from "../utils/ColumnUtil";
import { MindUtil } from "../utils/MindUtil";
import type { BoardElement } from "../types/element";
import type { CanvasBinding } from "./binding";

export const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export const authorSnapshot = (
  node: WhiteboardElementSnapshot
): import("../extensions/authorTypes").WhiteboardElement =>
  Object.freeze({
    id: node.id,
    type: node.type,
    name: node.name,
    style: node.style,
    data: node.data,
    geometry: node.geometry,
    children: Object.freeze(node.children.map(authorSnapshot)),
  });
export const flattenModel = (
  nodes: readonly WhiteboardElementSnapshot[]
): WhiteboardElementSnapshot[] => nodes.flatMap(node => [node, ...flattenModel(node.children)]);
export const flatten = (nodes: readonly BoardElement[]): BoardElement[] =>
  nodes.flatMap(node => [node, ...flatten(node.children ?? [])]);

export function authorElement(binding: CanvasBinding, id: string) {
  const snapshot = binding.model.read();
  return flattenModel([
    ...snapshot.pages.flatMap(page => [...page.children, ...page.recovery]),
    ...snapshot.recovery,
  ]).find(node => node.id === id);
}

export function project(binding: CanvasBinding, node: WhiteboardElementSnapshot): BoardElement {
  const mapped = binding.options.types[node.type];
  const type = mapped?.contractId === node.contractId ? mapped : undefined;
  const children = node.children.map(child => project(binding, child));
  const next: BoardElement = {
    id: node.id,
    type: node.type,
    contractId: node.contractId,
    dataVersion: binding.model.contracts.get(node.contractId)?.dataVersion,
    ...(node.body === undefined ? {} : { body: node.body }),
    ...(node.entity ? { entity: node.entity } : {}),
    ...(type &&
    binding.localEntities.get(node.id)?.key === JSON.stringify(node.entity) &&
    binding.localEntities.get(node.id)?.id != null
      ? node.entity?.kind === "content"
        ? { contentId: binding.localEntities.get(node.id)!.id }
        : node.entity?.kind === "video-note"
          ? { videoNoteId: binding.localEntities.get(node.id)!.id }
          : {}
      : {}),
    ...node.geometry,
    ...(type &&
    binding.measurements.get(node.id)?.baseWidth === node.geometry.width &&
    binding.measurements.get(node.id)?.baseHeight === node.geometry.height
      ? {
          width: binding.measurements.get(node.id)!.width,
          height: binding.measurements.get(node.id)!.height,
        }
      : {}),
    data: node.data,
    style: node.style,
    ...(node.name === undefined ? {} : { name: node.name }),
    ...(type ? binding.feedback.get(node.id) : undefined),
    ...canvasFields(node, type),
    ...(children.length ? { children } : {}),
  };
  if (type && node.type === "handwrite" && node.data.segmented === true) {
    const points = node.children.flatMap(
      segment =>
        (segment.data.points ??
          []) as unknown as import("../utils/HandwriteUtil").HandwriteInputPoint[]
    );
    const value = buildHandwriteElement(
      points,
      node.style as unknown as import("../utils/HandwriteUtil").HandwriteStyle,
      node.id
    );
    if (value) Object.assign(next, { points: value.points, outline: value.outline });
  }
  if (type && node.type === "handwrite")
    next.children = children.filter(
      child =>
        child.contractId !== binding.options.types["host.whiteboard.stroke-segment"]?.contractId
    );
  const previous = binding.projections.get(node.id);
  if (previous && equal(previous, next)) return previous;
  binding.projections.set(node.id, next);
  return next;
}

export function refresh(binding: CanvasBinding): void {
  if (!binding.board || binding.closed) return;
  const snapshot = binding.model.read();
  const page = snapshot.pages.find(page => page.id === binding.page);
  const layout = (node: BoardElement, parent?: string): BoardElement => {
    const children = (node.children ?? []).map(child => layout(child, node.type));
    const value = { ...node, ...(node.children ? { children } : {}) };
    if (binding.options.types[node.type]?.contractId !== node.contractId) return node;
    if (node.type === "column")
      return ColumnUtil.layoutColumn({
        ...value,
        children,
      } as import("../types/column").ColumnElement);
    if (node.type === "mind-node" && parent !== "mind-node") {
      const initialize = (entry: BoardElement, level: number): BoardElement => ({
        ...entry,
        level,
        actualHeight: entry.height,
        childrenHeight: 0,
        leftChildrenHeight: 0,
        rightChildrenHeight: 0,
        children: (entry.children ?? []).map(child => initialize(child, level + 1)),
      });
      return MindUtil.layout(initialize(value, 1) as import("../types/mind").MindNodeElement);
    }
    return node.children ? value : node;
  };
  let children = [...(page?.children ?? []), ...(page?.recovery ?? [])].map(node =>
    layout(project(binding, node))
  );
  for (const node of flattenModel([...(page?.children ?? []), ...(page?.recovery ?? [])])) {
    if (
      !node.entity ||
      !binding.options.resolveEntity ||
      !["content", "video-note"].includes(node.entity.kind)
    )
      continue;
    const key = JSON.stringify(node.entity);
    if (binding.localEntities.get(node.id)?.key === key) continue;
    binding.localEntities.set(node.id, { key, id: null });
    void binding.options
      .resolveEntity(node.entity)
      .then(id => {
        if (binding.closed || binding.localEntities.get(node.id)?.key !== key) return;
        binding.localEntities.set(node.id, { key, id });
        refresh(binding);
      })
      .catch(() => undefined);
  }
  children = resolveArrowBindings(binding, children);
  const retained = new Set(flatten(children).map(node => node.id));
  for (const id of binding.projections.keys())
    if (!retained.has(id)) binding.projections.delete(id);
  binding.board.publishDocument(
    children,
    page?.sketch ?? { mode: "normal", level: "natural" },
    structuredClone(
      snapshot.presentations ?? []
    ) as import("../types/presentation").PresentationSequence[]
  );
}

export function resolveArrowBindings(
  binding: CanvasBinding,
  children: BoardElement[]
): BoardElement[] {
  const elements = new Map(flatten(children).map(node => [node.id, node]));
  const connect = (node: BoardElement): BoardElement => {
    if (node.type === "arrow" && binding.options.types.arrow?.contractId === node.contractId) {
      const points = [...(node.points ?? [])];
      for (const [key, at] of [
        ["source", 0],
        ["target", points.length - 1],
      ] as const) {
        const end = node[key],
          target = end?.bindId && elements.get(end.bindId);
        const point =
          target && binding.board!.getArrowBindPoint(target, end.connectId, end.customOffset);
        if (point && at >= 0) points[at] = point;
      }
      return equal(points, node.points) ? node : { ...node, points };
    }
    return node.children ? { ...node, children: node.children.map(connect) } : node;
  };
  return children.map(connect);
}

export function measureElement(
  binding: CanvasBinding,
  id: string,
  size: { width: number; height: number }
): void {
  if (
    binding.closed ||
    !binding.supportsElement(id) ||
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width < 0 ||
    size.height < 0
  )
    return;
  const previous = binding.measurements.get(id);
  if (
    previous &&
    Math.abs(previous.width - size.width) < 0.01 &&
    Math.abs(previous.height - size.height) < 0.01 &&
    previous.baseWidth === authorElement(binding, id)?.geometry.width &&
    previous.baseHeight === authorElement(binding, id)?.geometry.height
  )
    return;
  const geometry = authorElement(binding, id)!.geometry;
  binding.measurements.set(id, { ...size, baseWidth: geometry.width, baseHeight: geometry.height });
  refresh(binding);
}

export function refreshLayout(binding: CanvasBinding): void {
  refresh(binding);
}
