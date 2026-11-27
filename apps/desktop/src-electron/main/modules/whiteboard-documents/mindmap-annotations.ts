import type { MindmapAgentCandidate } from "./mindmap-agent";
import type { Operation } from "./mindmap-agent-utils";
import type { WhiteboardElementSnapshot, WhiteboardData, WhiteboardJson } from "@tau/collaboration";
import { isContentEntityReference } from "@tau/db-schema/content-identities";
import { adjacentMindSiblings, normalizeTree } from "@tau/whiteboard/mindmap";
import {
  mindKeys,
  mindError,
  mindEnum,
  mindIndex,
  mindIds,
  mindStructure,
  mindRange,
  mindString,
  mindObject,
  mindBoolean,
  mindInteger,
  isSingleMindLayout,
} from "../../../../shared/whiteboard-mindmap";
import { endpointId } from "../../../../shared/whiteboard-agent";
import { editMindText } from "./mindmap-text";
import { removeMindNodes } from "./mindmap-structure";

export function editMindRange(ctx: MindmapAgentCandidate, op: Operation) {
  mindKeys(
    op,
    ["kind", "action", "id", "nodeIds", ...(op.kind === "boundary" ? ["title"] : ["text"])],
    "operation"
  );
  const action =
    op.action === undefined
      ? "create"
      : mindEnum(op.action, ["create", "update", "remove"], "action");
  const boundary = op.kind === "boundary";
  if (!boundary && action === "remove") {
    if (!ctx.node(op.id).data.summaryRange)
      mindError("NOT_A_SUMMARY", "目标不是概要节点", { path: "id", actual: op.id });
    return removeMindNodes(ctx, { kind: "remove", id: op.id });
  }
  const index = mindIndex(ctx.page());
  let parent: WhiteboardElementSnapshot | undefined;
  let startId: string | undefined, endId: string | undefined;
  if (op.nodeIds !== undefined) {
    const selected = mindIds(op.nodeIds, "nodeIds").map(id => ctx.node(id, "nodeIds"));
    const root = ctx.root(selected[0]),
      structure = mindStructure(root);
    normalizeTree(structure, isSingleMindLayout(root.data.layout));
    const adjacent = adjacentMindSiblings(
      structure,
      selected.map(node => node.id)
    );
    if (!adjacent)
      mindError("INVALID_RANGE", "概要和外框必须圈定同父、同侧、连续相邻的普通节点", {
        path: "nodeIds",
        elementIds: selected.map(node => node.id),
        actual: selected.map(node => ({
          id: node.id,
          parentId: index.parents.get(node.id)?.id,
          side: index.sides.get(node.id),
          summary: Boolean(node.data.summaryRange),
        })),
        suggestion:
          "选择同一父节点下同侧相邻的普通节点；不要包含根节点或概要节点。可先通过 move 调整顺序。",
      });
    parent = ctx.node(adjacent.parent.id);
    startId = adjacent.first.id;
    endId = adjacent.last.id;
  }
  if (boundary) {
    const id = action === "create" ? ctx.created(op.id) : ctx.lookup(op.id, "id");
    if (action !== "create")
      parent = [...index.nodes.values()].find(
        node =>
          Array.isArray(node.data.boundaries) &&
          node.data.boundaries.some(
            value => value && typeof value === "object" && "id" in value && value.id === id
          )
      );
    if (!parent)
      mindError("BOUNDARY_NOT_FOUND", "未找到外框所属父节点或创建时缺少 nodeIds", {
        path: action === "create" ? "nodeIds" : "id",
        actual: op.id,
        retry: "reread",
        suggestion: "创建时提供 nodeIds；更新或删除时使用读取结果中的外框 id。",
      });
    ctx.guard(parent.id, "structure", "boundaries");
    const before = Array.isArray(parent.data.boundaries) ? parent.data.boundaries : [];
    const next =
      action === "create"
        ? {
            id,
            startId,
            endId,
            ...(op.title === undefined ? {} : { title: mindString(op.title, "title", 1024) }),
          }
        : undefined;
    if (next && (!startId || !endId))
      mindError("RANGE_REQUIRED", "创建外框需要 nodeIds", { path: "nodeIds" });
    const after =
      action === "create"
        ? [...before, next]
        : before.flatMap(value => {
            if (!value || typeof value !== "object" || Array.isArray(value) || value.id !== id)
              return [value];
            if (action === "remove") return [];
            return [
              {
                ...value,
                ...(startId && endId ? { startId, endId } : {}),
                ...(op.title === undefined ? {} : { title: mindString(op.title, "title", 1024) }),
              },
            ];
          });
    ctx.submit([
      {
        type: "patch_records",
        id: parent.id,
        field: "boundaries",
        before,
        after: after as WhiteboardData[],
      },
    ]);
    return;
  }
  if (action === "create") {
    if (!parent || !startId || !endId)
      mindError("RANGE_REQUIRED", "创建概要需要 nodeIds", { path: "nodeIds" });
    ctx.guard(parent.id, "structure");
    const existing = parent.children.find(child => {
      const range = mindRange(child.data.summaryRange);
      return range?.startId === startId && range?.endId === endId;
    });
    if (existing)
      mindError("SUMMARY_ALREADY_EXISTS", "该范围已有概要，原内容保持不变", {
        elementIds: [existing.id],
        actual: { summaryId: existing.id },
        suggestion: "使用已返回的 summaryId 修改已有概要正文，不要再次创建。",
      });
    const id = ctx.created(op.id);
    ctx.submit([
      {
        type: "create",
        id,
        contractId: ctx.contracts.builtins.types["mind-node"].contractId,
        parent: { kind: "element", id: parent.id },
        geometry: { x: 0, y: 0, width: 24, height: 52, rotation: 0 },
        data: { direction: index.sides.get(startId) ?? "right", summaryRange: { startId, endId } },
        body: ctx.body(op.text ?? ""),
      },
    ]);
  } else {
    const node = ctx.node(op.id),
      owner = index.parents.get(node.id);
    if (!node.data.summaryRange)
      mindError("NOT_A_SUMMARY", "目标不是概要节点", { path: "id", elementIds: [node.id] });
    ctx.guard(node.id, "structure");
    if (parent && owner?.id !== parent.id)
      mindError("RANGE_PARENT_MISMATCH", "新范围必须与概要属于同一父节点", {
        expected: owner?.id,
        actual: parent.id,
      });
    if (startId && endId)
      ctx.submit([{ type: "set_data", id: node.id, patch: { summaryRange: { startId, endId } } }]);
    if (op.text !== undefined) editMindText(ctx, { kind: "edit_text", id: node.id, text: op.text });
  }
}

export function editMindRelation(ctx: MindmapAgentCandidate, op: Operation) {
  mindKeys(op, ["kind", "action", "id", "from", "to", "text", "reverse", "style"], "operation");
  const action =
    op.action === undefined
      ? "create"
      : mindEnum(op.action, ["create", "update", "remove"], "action");
  const node = action === "create" ? undefined : ctx.node(op.id, "id", false);
  if (
    node &&
    (node.type !== "arrow" ||
      ![endpointId(node.data.source), endpointId(node.data.target)].every(
        id => id && mindIndex(ctx.page()).nodes.get(id)?.type === "mind-node"
      ))
  )
    mindError("NOT_A_MIND_RELATION", "目标不是两端绑定原生导图节点的联系线", {
      path: "id",
      elementIds: [node.id],
    });
  if (node && action === "remove") {
    ctx.guard(node.id, "subtree");
    ctx.removeIds(new Set([node.id]));
    return;
  }
  const from =
    op.from !== undefined
      ? ctx.node(op.from, "from")
      : node && ctx.node(endpointId(node.data.source), "from");
  const to =
    op.to !== undefined
      ? ctx.node(op.to, "to")
      : node && ctx.node(endpointId(node.data.target), "to");
  if (!from || !to)
    mindError("ENDPOINT_REQUIRED", "创建联系线需要 from 和 to 节点 ID", {
      expected: ["from", "to"],
    });
  if (from.id === to.id)
    mindError("SELF_RELATION", "联系线两端不能是同一节点", { elementIds: [from.id] });
  ctx.guard(from.id, "structure");
  ctx.guard(to.id, "structure");
  if (node) ctx.guard(node.id, "structure");
  const patch: Record<string, WhiteboardJson> = {};
  const oldSource = node ? mindObject(node.data.source, "source") : undefined;
  const oldTarget = node ? mindObject(node.data.target, "target") : undefined;
  const source = {
      bindId: from.id,
      connectId: "center",
      marker: typeof oldSource?.marker === "string" ? oldSource.marker : "none",
    },
    target = {
      bindId: to.id,
      connectId: "center",
      marker: typeof oldTarget?.marker === "string" ? oldTarget.marker : "open-arrow",
    };
  if (!node || op.from !== undefined) patch.source = source;
  if (!node || op.to !== undefined) patch.target = target;
  if (op.style !== undefined) {
    if (node) ctx.guard(node.id, "style");
    const style = mindObject(op.style, "style");
    mindKeys(
      style,
      [
        "lineType",
        "lineWidth",
        "themeColorId",
        "dashed",
        "animated",
        "animationSpeed",
        "sourceMarker",
        "targetMarker",
        "midPoint",
      ],
      "style"
    );
    for (const [key, value] of Object.entries(style)) {
      if (key === "lineType")
        patch[key] = mindEnum(value, ["straight", "curve", "orthogonal"], "style.lineType");
      else if (key === "lineWidth") {
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 32)
          mindError("INVALID_ARGUMENT", "线宽必须在 0–32 之间", {
            path: "style.lineWidth",
            actual: value,
          });
        patch[key] = value;
      } else if (key === "themeColorId") patch[key] = mindString(value, "style.themeColorId", 64);
      else if (key === "dashed" || key === "animated")
        patch[key] = mindBoolean(value, `style.${key}`);
      else if (key === "animationSpeed")
        patch[key] = mindInteger(value, "style.animationSpeed", 1, 10);
      else if (key === "midPoint") {
        if (node) ctx.guard(node.id, "position");
        patch.midPoint = ctx.point(value, "style.midPoint");
      } else {
        const end = key === "sourceMarker" ? "source" : "target";
        const previous = patch[end] ?? node?.data[end];
        patch[end] = {
          ...(end === "source" ? source : target),
          ...(previous && typeof previous === "object" && !Array.isArray(previous) ? previous : {}),
          marker: mindEnum(
            value,
            ["none", "arrow", "open-arrow", "closed-arrow", "diamond", "circle"],
            `style.${key}`
          ),
        };
      }
    }
  }
  if (op.reverse !== undefined && mindBoolean(op.reverse, "reverse")) {
    if (node) ctx.guard(node.id, "position");
    const a = mindObject(patch.source ?? node?.data.source ?? source, "source"),
      b = mindObject(patch.target ?? node?.data.target ?? target, "target");
    patch.source = { ...b, marker: a.marker } as WhiteboardData;
    patch.target = { ...a, marker: b.marker } as WhiteboardData;
    if (node && Array.isArray(node.data.points)) patch.points = [...node.data.points].reverse();
  }
  if (!node) {
    const id = ctx.created(op.id);
    const points = [
      {
        x: from.geometry.x + from.geometry.width / 2,
        y: from.geometry.y + from.geometry.height / 2,
      },
      { x: to.geometry.x + to.geometry.width / 2, y: to.geometry.y + to.geometry.height / 2 },
    ];
    ctx.submit([
      {
        type: "create",
        id,
        contractId: ctx.contracts.builtins.types.arrow.contractId,
        parent: { kind: "page", id: ctx.page().id },
        geometry: {
          x: Math.min(points[0].x, points[1].x),
          y: Math.min(points[0].y, points[1].y),
          width: Math.abs(points[0].x - points[1].x),
          height: Math.abs(points[0].y - points[1].y),
          rotation: 0,
        },
        data: {
          lineType: "curve",
          lineWidth: 1.6,
          themeColorId: "gray",
          dashed: true,
          dashArray: [6, 4],
          points,
          source,
          target,
          ...patch,
        },
        body: ctx.body(op.text ?? ""),
      },
    ]);
  } else {
    if (Object.keys(patch).length) ctx.submit([{ type: "set_data", id: node.id, patch }]);
    if (op.text !== undefined)
      editMindText(ctx, { kind: "edit_text", id: node.id, text: op.text }, node);
  }
}

export function setMindNote(ctx: MindmapAgentCandidate, op: Operation) {
  mindKeys(op, ["kind", "id", "entity", "contentId", "title"], "operation");
  const node = ctx.node(op.id);
  ctx.guard(node.id, "note");
  if (op.entity !== undefined && op.contentId !== undefined)
    mindError("AMBIGUOUS_REFERENCE", "entity 与 contentId 只能提供一项", { path: "entity" });
  let entity = op.entity;
  if (op.contentId !== undefined) {
    const id = mindInteger(op.contentId, "contentId", 1, Number.MAX_SAFE_INTEGER);
    if (!ctx.noteReference)
      mindError("NOTE_SERVICE_UNAVAILABLE", "笔记引用服务不可用", {
        retry: "refresh_context",
        suggestion: "重新打开目标白板后重试。",
      });
    try {
      entity = ctx.noteReference(id);
    } catch (error) {
      mindError("NOTE_NOT_FOUND", "无法找到该 contentId 对应的笔记正文", {
        path: "contentId",
        actual: id,
        retry: "reread",
        suggestion: "检索笔记并使用结果中的 contentId，不要把卡片 ID 或文章 ID 当作正文 ID。",
        expected: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (
    entity !== null &&
    (!isContentEntityReference(entity) ||
      !["content", "card", "article", "project-item", "diary-moment"].includes(entity.kind))
  )
    mindError(
      "INVALID_NOTE_REFERENCE",
      "关联笔记必须使用稳定的正文实体引用，解除关联传 entity:null",
      {
        path: "entity",
        actual: entity,
        expected: {
          sourceId: "稳定来源",
          kind: "content/card/article/project-item/diary-moment",
          entityId: "稳定实体标识",
        },
      }
    );
  if (entity !== null && ctx.resolveNote) {
    const contentId = ctx.resolveNote(entity);
    if (contentId === null)
      mindError("NOTE_NOT_FOUND", "当前资料库无法解析该笔记，笔记可能已删除或不属于此资料库", {
        path: "entity",
        actual: entity,
        retry: "reread",
        suggestion: "重新检索目标笔记，使用当前资料库中的 contentId 或稳定实体引用。",
      });
    if (entity.kind !== "content") {
      if (!ctx.noteReference)
        mindError("NOTE_SERVICE_UNAVAILABLE", "无法将实体解析为原生笔记正文引用", {
          path: "entity",
        });
      entity = ctx.noteReference(contentId);
    }
  }
  const reference =
    entity === null
      ? null
      : isContentEntityReference(entity)
        ? entity
        : mindError("INVALID_NOTE_REFERENCE", "笔记引用未能解析为稳定身份", {
            path: "entity",
            actual: entity,
          });
  ctx.submit([
    { type: "set_entity", id: node.id, entity: reference },
    {
      type: "set_data",
      id: node.id,
      patch:
        op.title !== undefined && entity !== null
          ? { contentTitle: mindString(op.title, "title", 1024) }
          : {},
      ...(entity === null || op.title === undefined ? { unset: ["contentTitle"] } : {}),
    },
  ]);
}
