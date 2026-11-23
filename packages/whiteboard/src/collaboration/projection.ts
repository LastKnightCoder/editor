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

const canvasIndexes = new WeakMap<BoardElement[], Map<string, BoardElement>>();
export function canvasElement(children: BoardElement[], id: string) {
  let index = canvasIndexes.get(children);
  if (!index) {
    index = new Map(flatten(children).map(node => [node.id, node]));
    canvasIndexes.set(children, index);
  }
  return index.get(id);
}

export function authorElement(binding: CanvasBinding, id: string) {
  const snapshot = binding.readSnapshot();
  return flattenModel([
    ...snapshot.pages.flatMap(page => [...page.children, ...page.recovery]),
    ...snapshot.recovery,
  ]).find(node => node.id === id);
}

/** 文档卡的稳定引用解析成本机身份后投影为 entityRef（只在本机，不写回文档），供去重、相关、翻页使用 */
const DOCUMENT_ENTITY_KINDS = new Set(["card", "article", "project-item", "diary-moment", "pdf"]);

// 笔迹分段是存储节点。比较投影输入即可复用已有轮廓，避免重新拟合和序列化整条曲线。
const strokeInputs = new WeakMap<BoardElement, string>();

export function project(binding: CanvasBinding, node: WhiteboardElementSnapshot): BoardElement {
  const mapped = binding.options.types[node.type];
  const type = mapped?.contractId === node.contractId ? mapped : undefined;
  const localEntity = binding.localEntities.get(node.id);
  const measurement = binding.measurements.get(node.id);
  const handwrite = type && node.type === "handwrite";
  const segmentContract = binding.options.types["host.whiteboard.stroke-segment"]?.contractId;
  const visibleChildren = handwrite
    ? node.children.filter(child => child.contractId !== segmentContract)
    : node.children;
  const children = visibleChildren.map(child => project(binding, child));
  const next: BoardElement = {
    id: node.id,
    type: node.type,
    contractId: node.contractId,
    dataVersion: binding.model.contracts.get(node.contractId)?.dataVersion,
    ...(node.body === undefined ? {} : { body: node.body }),
    ...(node.entity ? { entity: node.entity } : {}),
    ...(type && localEntity?.key === JSON.stringify(node.entity) && localEntity?.id != null
      ? node.entity?.kind === "content"
        ? { contentId: localEntity.id }
        : node.entity?.kind === "video-note"
          ? { videoNoteId: localEntity.id }
          : node.entity && node.type === "document" && DOCUMENT_ENTITY_KINDS.has(node.entity.kind)
            ? {
                entityRef: {
                  kind: node.entity.kind as
                    | "card"
                    | "article"
                    | "project-item"
                    | "diary-moment"
                    | "pdf",
                  id: localEntity.id,
                },
              }
            : {}
      : {}),
    ...node.geometry,
    ...(type &&
    measurement?.baseWidth === node.geometry.width &&
    measurement?.baseHeight === node.geometry.height
      ? {
          width: measurement.width,
          height: measurement.height,
        }
      : {}),
    data: node.data,
    style: node.style,
    ...(node.name === undefined ? {} : { name: node.name }),
    ...(type ? binding.feedback.get(node.id) : undefined),
    ...canvasFields(node, type),
    ...(handwrite || children.length ? { children } : {}),
  };
  const previous = binding.projections.get(node.id);
  if (handwrite && node.data.segmented === true) {
    const inputs = JSON.stringify([next, node.children.map(segment => segment.data.points)]);
    if (previous && strokeInputs.get(previous) === inputs) return previous;
    strokeInputs.set(next, inputs);
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
  } else if (previous && equal(previous, next)) return previous;
  binding.projections.set(node.id, next);
  return next;
}

export function refresh(binding: CanvasBinding): void {
  if (!binding.board || binding.closed) return;
  const snapshot = binding.readSnapshot();
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
    return node.children?.length ? value : node;
  };
  let children = [...(page?.children ?? []), ...(page?.recovery ?? [])].map(node =>
    layout(project(binding, node))
  );
  for (const node of flattenModel([...(page?.children ?? []), ...(page?.recovery ?? [])])) {
    if (
      !node.entity ||
      !binding.options.resolveEntity ||
      !(
        ["content", "video-note"].includes(node.entity.kind) ||
        (node.type === "document" && DOCUMENT_ENTITY_KINDS.has(node.entity.kind))
      )
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
  const board = binding.board;
  const connect = (node: BoardElement): BoardElement => {
    if (node.type === "arrow" && binding.options.types.arrow?.contractId === node.contractId) {
      const points = [...(node.points ?? [])];
      for (const [key, at] of [
        ["source", 0],
        ["target", points.length - 1],
      ] as const) {
        const end = node[key],
          target = end?.bindId && elements.get(end.bindId);
        const point = target && board?.getArrowBindPoint(target, end.connectId, end.customOffset);
        if (point && at >= 0) points[at] = point;
      }
      return equal(points, node.points) ? node : { ...node, points };
    }
    return node.children?.length ? { ...node, children: node.children.map(connect) } : node;
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
  const element = authorElement(binding, id);
  if (!element) return;
  const previous = binding.measurements.get(id);
  if (
    previous &&
    Math.abs(previous.width - size.width) < 0.01 &&
    Math.abs(previous.height - size.height) < 0.01 &&
    previous.baseWidth === element.geometry.width &&
    previous.baseHeight === element.geometry.height
  )
    return;
  const geometry = element.geometry;
  binding.measurements.set(id, { ...size, baseWidth: geometry.width, baseHeight: geometry.height });
  refresh(binding);
}

export function refreshLayout(binding: CanvasBinding): void {
  refresh(binding);
}
