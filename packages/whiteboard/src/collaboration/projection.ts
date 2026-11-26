import { projectArrowTree } from "../utils/ArrowProjection";
import { matchesCanvasContract } from "./types";
import { canvasFields } from "./builtins";
import { buildHandwriteElement } from "../extensions/creators/handwrite";
import { inactiveMindRelationIds, type WhiteboardElementSnapshot } from "@tau/collaboration";
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
): WhiteboardElementSnapshot[] => {
  const result: WhiteboardElementSnapshot[] = [];
  const visit = (items: readonly WhiteboardElementSnapshot[]) => {
    for (const node of items) {
      result.push(node);
      if (node.children.length) visit(node.children);
    }
  };
  visit(nodes);
  return result;
};
export const flatten = (nodes: readonly BoardElement[]): BoardElement[] => {
  const result: BoardElement[] = [];
  const visit = (items: readonly BoardElement[]) => {
    for (const node of items) {
      result.push(node);
      if (node.children?.length) visit(node.children);
    }
  };
  visit(nodes);
  return result;
};

const canvasIndexes = new WeakMap<BoardElement[], Map<string, BoardElement>>();
export function canvasElement(children: BoardElement[], id: string) {
  let index = canvasIndexes.get(children);
  if (!index) {
    index = new Map(flatten(children).map(node => [node.id, node]));
    canvasIndexes.set(children, index);
  }
  return index.get(id);
}

const modelIndexes = new WeakMap<
  ReturnType<CanvasBinding["readSnapshot"]>,
  Map<string, WhiteboardElementSnapshot>
>();
export function authorElement(binding: CanvasBinding, id: string) {
  const snapshot = binding.readSnapshot();
  let index = modelIndexes.get(snapshot);
  if (!index) {
    index = new Map(
      flattenModel([
        ...snapshot.pages.flatMap(page => [...page.children, ...page.recovery]),
        ...snapshot.recovery,
      ]).map(node => [node.id, node])
    );
    modelIndexes.set(snapshot, index);
  }
  return index.get(id);
}

/** 文档卡的稳定引用解析成本机身份后投影为 entityRef（只在本机，不写回文档），供去重、相关、翻页使用 */
const DOCUMENT_ENTITY_KINDS = new Set(["card", "article", "project-item", "diary-moment", "pdf"]);

// 笔迹分段是存储节点。比较投影输入即可复用已有轮廓，避免重新拟合和序列化整条曲线。
const strokeInputs = new WeakMap<BoardElement, string>();
function sameProjection(previous: BoardElement, next: BoardElement): boolean {
  const keys = Object.keys(next);
  if (Object.keys(previous).length !== keys.length) return false;
  let deep = false;
  for (const key of keys) {
    if (!Object.hasOwn(previous, key)) return false;
    const a = previous[key],
      b = next[key];
    if (a === b) continue;
    if (key === "children" && Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length || a.some((child, index) => child !== b[index])) return false;
    } else if (a && b && typeof a === "object" && typeof b === "object") deep = true;
    else return false;
  }
  return !deep || equal(previous, next);
}
const leafProjections = new WeakMap<
  CanvasBinding,
  WeakMap<WhiteboardElementSnapshot, { inputs: readonly unknown[]; value: BoardElement }>
>();
const layoutProjections = new WeakMap<
  CanvasBinding,
  WeakMap<BoardElement, Map<string | undefined, BoardElement>>
>();

export function clearProjectionCache(binding: CanvasBinding): void {
  leafProjections.delete(binding);
  layoutProjections.delete(binding);
}

export function project(binding: CanvasBinding, node: WhiteboardElementSnapshot): BoardElement {
  const mapped = binding.options.types[node.type];
  const type = matchesCanvasContract(mapped, node.contractId) ? mapped : undefined;
  const localEntity = binding.localEntities.get(node.id);
  const measurement = binding.measurements.get(node.id);
  let leaves = leafProjections.get(binding);
  if (!leaves) {
    leaves = new WeakMap();
    leafProjections.set(binding, leaves);
  }
  const inputs = [type, localEntity, measurement, binding.feedback.get(node.id)];
  const cached = !node.children.length ? leaves.get(node) : undefined;
  if (cached && inputs.every((input, index) => input === cached.inputs[index])) {
    binding.projections.set(node.id, cached.value);
    return cached.value;
  }
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
  } else if (previous && sameProjection(previous, next)) {
    if (!node.children.length) leaves.set(node, { inputs, value: previous });
    return previous;
  }
  binding.projections.set(node.id, next);
  if (!node.children.length) leaves.set(node, { inputs, value: next });
  return next;
}

export function refresh(binding: CanvasBinding): void {
  if (!binding.board || binding.closed) return;
  const snapshot = binding.readSnapshot();
  const page = snapshot.pages.find(page => page.id === binding.page);
  let layouts = layoutProjections.get(binding);
  if (!layouts) {
    layouts = new WeakMap();
    layoutProjections.set(binding, layouts);
  }
  const layout = (node: BoardElement, parent?: string): BoardElement => {
    const cached = layouts.get(node)?.get(parent);
    if (cached) return cached;
    const value = computeLayout(node, parent);
    if (node.type !== "mind-node") {
      const variants = layouts.get(node) ?? new Map();
      variants.set(parent, value);
      layouts.set(node, variants);
    }
    return value;
  };
  const computeLayout = (node: BoardElement, parent?: string): BoardElement => {
    const children = (node.children ?? []).map(child => layout(child, node.type));
    const value = { ...node, ...(node.children ? { children } : {}) };
    if (!matchesCanvasContract(binding.options.types[node.type], node.contractId)) return node;
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
  children = resolveArrowBindings(binding, children, snapshot);
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
  binding.prepareGeometryWhenIdle();
}

export function resolveArrowBindings(
  binding: CanvasBinding,
  children: BoardElement[],
  snapshot?: ReturnType<CanvasBinding["readSnapshot"]>
): BoardElement[] {
  if (!binding.board) return children;
  const eligible = (node: BoardElement) =>
    node.type === "arrow" && binding.options.types.arrow?.contractId === node.contractId;
  if (!children.some(eligible)) return children;
  const inactive = inactiveMindRelationIds(binding.model, snapshot ?? binding.readSnapshot());
  return projectArrowTree(
    binding.board,
    children.filter(node => !inactive.has(node.id)),
    eligible
  );
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
