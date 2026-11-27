import type { MindmapAgentCandidate } from "./mindmap-agent";
import type { Operation } from "./mindmap-agent-utils";
import type {
  WhiteboardElementSnapshot,
  WhiteboardModelCommand,
  WhiteboardJson,
} from "@tau/collaboration";
import { mindKeys, mindError, mindIndex } from "../../../../shared/whiteboard-mindmap";
import { pageElements } from "../../../../shared/whiteboard-agent";
import { hash, anchor, stripIdentity, type Placement } from "./mindmap-agent-utils";

export function moveMindNode(ctx: MindmapAgentCandidate, op: Operation) {
  mindKeys(op, ["kind", "id", "parentId", "beforeId", "afterId", "side", "at"], "operation");
  const node = ctx.node(op.id),
    placement = ctx.placement(op, node);
  ctx.guard(node.id, "structure");
  if (placement.beforeId === node.id || placement.afterId === node.id)
    mindError("INVALID_ANCHOR", "不能相对自身插入", { path: "beforeId", elementIds: [node.id] });
  const removed = ctx.detachRanges(node);
  const { direction } = placement;
  const commands: WhiteboardModelCommand[] = [
    {
      type: "move_node",
      id: node.id,
      parent: placement.parent,
      ...anchor(placement.beforeId, placement.afterId),
    },
  ];
  if (op.at !== undefined) {
    ctx.guard(node.id, "position");
    const at = ctx.point(op.at, "at");
    if (
      placement.parent.kind === "element" &&
      ctx.node(placement.parent.id, "parentId", false).type === "mind-node"
    )
      mindError("DERIVED_POSITION", "导图子节点的位置由布局计算，不能指定 at", {
        path: "at",
        suggestion: "通过 parentId、beforeId、afterId 和 side 调整子节点位置；at 只用于独立导图。",
      });
    commands.push({
      type: "set_node",
      id: node.id,
      patch: { geometry: { ...node.geometry, ...at } },
    });
  }
  const currentIndex = mindIndex(ctx.page());
  const attaching =
    placement.parent.kind === "element" &&
    ctx.node(placement.parent.id, "parentId", false).type === "mind-node";
  const wasBranch = currentIndex.parents.get(node.id)?.type === "mind-node";
  if (attaching || wasBranch)
    for (const branch of pageElements([node]))
      commands.push({ type: "set_data", id: branch.id, patch: { direction } });
  commands.push({
    type: "set_data",
    id: node.id,
    patch: {},
    unset: [
      "summaryRange",
      ...(placement.parent.kind === "element" &&
      ctx.node(placement.parent.id, "parentId", false).type === "mind-node"
        ? ["layout", "themeId", "themeStyle"]
        : []),
    ],
  });
  ctx.submit(commands);
  ctx.expandParent(placement);
  ctx.removeIds(removed);
}

export function copyMindBranch(ctx: MindmapAgentCandidate, op: Operation) {
  mindKeys(
    op,
    ["kind", "id", "sourceId", "parentId", "beforeId", "afterId", "side", "at"],
    "operation"
  );
  const id = ctx.created(op.id),
    source = ctx.node(op.sourceId, "sourceId");
  ctx.guard(source.id, "subtree");
  const index = mindIndex(ctx.page());
  const sourceParent = index.parents.get(source.id);
  const position =
    op.parentId === undefined &&
    op.beforeId === undefined &&
    op.afterId === undefined &&
    sourceParent?.type === "mind-node"
      ? { ...op, parentId: sourceParent.id, afterId: source.id }
      : op;
  const placement = ctx.placement(position);
  const attaching =
    placement.parent.kind === "element" &&
    ctx.node(placement.parent.id, "parentId", false).type === "mind-node";
  if (!attaching && op.at === undefined)
    mindError("POSITION_REQUIRED", "复制为独立导图需要指定 at，避免副本覆盖原图", {
      path: "at",
      expected: { x: "number", y: "number" },
      suggestion: "从读取结果与当前视口选择空白位置，传入 at:{x,y}。复制为同级分支时无需坐标。",
    });
  if (
    op.at !== undefined &&
    placement.parent.kind === "element" &&
    ctx.node(placement.parent.id, "parentId", false).type === "mind-node"
  )
    mindError("DERIVED_POSITION", "复制到导图下的子节点不能指定 at", {
      path: "at",
      suggestion: "省略 at，使用父节点、同级锚点和方向定位。",
    });
  const mapping = new Map(
    pageElements([source]).map((node, i) => [
      node.id,
      i === 0 ? id : "agent-" + hash([id, node.id]),
    ])
  );
  const range = (value: WhiteboardJson): WhiteboardJson => {
    if (Array.isArray(value)) return value.map(range);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        ["startId", "endId"].includes(key) && typeof item === "string"
          ? (mapping.get(item) ?? item)
          : range(item),
      ])
    );
  };
  const commands: WhiteboardModelCommand[] = [];
  const create = (node: WhiteboardElementSnapshot, parent: Placement["parent"], first: boolean) => {
    const targetId = mapping.get(node.id);
    if (!targetId) mindError("COPY_ID_MISSING", "复制分支缺少目标身份", { elementIds: [node.id] });
    const data: Record<string, WhiteboardJson> = structuredClone(node.data);
    if (data.summaryRange) data.summaryRange = range(data.summaryRange);
    if (Array.isArray(data.boundaries))
      data.boundaries = data.boundaries.map((value, i) => {
        const remapped = range(value);
        return remapped && typeof remapped === "object" && !Array.isArray(remapped)
          ? { ...remapped, id: "agent-" + hash([targetId, "boundary", i]) }
          : remapped;
      });
    if (attaching || sourceParent?.type === "mind-node") data.direction = placement.direction;
    if (first) {
      delete data.summaryRange;
      if (parent.kind === "element" && ctx.node(parent.id, "parentId", false).type === "mind-node")
        for (const key of ["layout", "themeId", "themeStyle"]) delete data[key];
    }
    const at = first && op.at !== undefined ? ctx.point(op.at, "at") : {};
    commands.push({
      type: "create",
      id: targetId,
      contractId: node.contractId,
      data,
      geometry: { ...node.geometry, ...at },
      parent,
      ...(first ? anchor(placement.beforeId, placement.afterId) : {}),
      ...(Array.isArray(node.body) ? { body: node.body.map(stripIdentity) } : {}),
      ...(node.entity ? { entity: node.entity } : {}),
    });
    if (Object.keys(node.style).length)
      commands.push({ type: "set_node", id: targetId, patch: { style: node.style } });
    node.children.forEach(child => create(child, { kind: "element", id: targetId }, false));
  };
  create(source, placement.parent, true);
  ctx.submit(commands);
  ctx.expandParent(placement);
}

export function removeMindNodes(ctx: MindmapAgentCandidate, op: Operation) {
  mindKeys(op, ["kind", "id"], "operation");
  const node = ctx.node(op.id);
  ctx.guard(node.id, "subtree");
  const removed = ctx.detachRanges(node);
  removed.add(node.id);
  ctx.removeIds(removed);
}
