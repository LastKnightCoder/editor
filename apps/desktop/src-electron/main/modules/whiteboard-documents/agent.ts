import { createHash } from "node:crypto";
import { canonicalContractJson, prepareContentContract } from "@tau/db-schema/content-contracts";
import { prepareBuiltinWhiteboardTypes } from "@tau/whiteboard/contracts";
import {
  WHITEBOARD_LIMITS,
  type WhiteboardModel,
  type WhiteboardElementSnapshot,
  type WhiteboardGeometry,
  type WhiteboardModelCommand,
} from "@tau/collaboration";
import {
  coordKeys,
  endpointId,
  pageElements,
  readGeometry,
  simpleLabel,
  type AgentBoardRequest,
} from "../../../../shared/whiteboard-agent";
import { mindError } from "../../../../shared/whiteboard-mindmap";
import { MindmapAgentCandidate } from "./mindmap-agent";

const digest = (value: unknown) =>
  createHash("sha256").update(canonicalContractJson(value)).digest("base64url");
const keyPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
function key(value: unknown): string {
  if (typeof value !== "string" || !keyPattern.test(value)) throw new Error("元素或请求标识无效");
  return value;
}
function textValue(value: unknown) {
  if (typeof value !== "string" || value.length > 8192) throw new Error("文字超过限制或无效");
  return value;
}

export function identifyAgentBatch(req: AgentBoardRequest) {
  if (
    !req ||
    !req.owner ||
    typeof req.owner !== "string" ||
    req.owner.length > 512 ||
    typeof req.pageId !== "string" ||
    !Array.isArray(req.operations) ||
    !req.operations.length ||
    req.operations.length > WHITEBOARD_LIMITS.commandsPerBatch
  )
    throw new Error("白板操作批次无效");
  const bytes = Buffer.byteLength(JSON.stringify(req));
  if (bytes > WHITEBOARD_LIMITS.batchBytes) throw new Error("白板操作批次超限");
  const prefix =
    "agent:" +
    digest(
      req.domain === "mindmap"
        ? ["mindmap", req.pageId, req.owner, key(req.requestId)]
        : [req.pageId, req.owner, key(req.requestId)]
    ) +
    ":";
  const ids = new Map<string, string>();
  for (const op of req.operations) {
    if (!op || typeof op !== "object") throw new Error("白板操作无效");
    const create =
      req.domain === "mindmap"
        ? ["insert", "copy"].includes(String(op.kind)) ||
          (["summary", "boundary", "relation"].includes(String(op.kind)) &&
            (op.action === undefined || op.action === "create"))
        : ["shape", "text", "connect"].includes(String(op.kind));
    if (create) {
      const alias = key(op.id);
      if (ids.has(alias)) {
        if (req.domain === "mindmap")
          mindError("DUPLICATE_ID", "批次内创建操作的临时名称重复", {
            path: "operations.id",
            actual: alias,
            suggestion: "为每个创建操作使用不同的临时 id；已有对象的修改仍使用原始 ID。",
          });
        throw new Error("批次内的临时名称重复");
      }
      ids.set(alias, "agent-" + digest([prefix, alias]));
    }
  }
  return {
    prefix,
    batchId:
      prefix +
      digest(
        req.domain === "mindmap"
          ? { operations: req.operations, preconditions: req.preconditions ?? [] }
          : req.operations
      ),
    ids,
    bytes,
  };
}

const prepare = async () => ({
  builtins: await prepareBuiltinWhiteboardTypes(),
  paragraph: await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    kind: "block",
    dataVersion: 1,
  }),
  link: await prepareContentContract("tau.link", { type: "link", kind: "inline", dataVersion: 1 }),
});
let contracts: ReturnType<typeof prepare> | undefined;
export const agentContracts = () =>
  (contracts ??= prepare().catch(error => {
    contracts = undefined;
    throw error;
  }));

type BoardPoint = { x: number; y: number };

function arrowBounds(points: readonly BoardPoint[]) {
  const xs = points.map(p => p.x),
    ys = points.map(p => p.y);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y, rotation: 0 };
}

function movedEndpoint(point: BoardPoint, from: WhiteboardGeometry, to: WhiteboardGeometry) {
  const u = from.width ? (point.x - from.x) / from.width : 0.5;
  const v = from.height ? (point.y - from.y) / from.height : 0.5;
  return { x: to.x + u * to.width, y: to.y + v * to.height };
}

function updateConnectedArrows(
  nodes: Map<string, WhiteboardElementSnapshot>,
  geometry: Map<string, WhiteboardGeometry>,
  commands: WhiteboardModelCommand[]
) {
  for (const arrow of nodes.values()) {
    if (arrow.type !== "arrow") continue;
    const source = endpointId(arrow.data.source),
      target = endpointId(arrow.data.target);
    if (!(source && geometry.has(source)) && !(target && geometry.has(target))) continue;
    const values = arrow.data.points;
    if (!Array.isArray(values) || values.length < 2)
      throw new Error("关联箭头缺少端点 " + arrow.id);
    const points = values.map(p => {
      if (
        !p ||
        typeof p !== "object" ||
        !("x" in p) ||
        !("y" in p) ||
        typeof p.x !== "number" ||
        typeof p.y !== "number"
      )
        throw new Error("关联箭头坐标无效 " + arrow.id);
      return { x: p.x, y: p.y };
    });
    for (const [id, index] of [
      [source, 0],
      [target, points.length - 1],
    ] as const) {
      const from = id && nodes.get(id)?.geometry,
        to = id && geometry.get(id);
      if (from && to) points[index] = movedEndpoint(points[index], from, to);
    }
    commands.push(
      { type: "set_data", id: arrow.id, patch: { points } },
      { type: "set_node", id: arrow.id, patch: { geometry: arrowBounds(points) } }
    );
  }
}

export async function editAgentCandidate(
  model: WhiteboardModel,
  req: AgentBoardRequest,
  ids: Map<string, string>,
  contracts: Awaited<ReturnType<typeof prepare>>,
  notes?: {
    reference: (
      contentId: number
    ) => import("@tau/db-schema/content-identities").ContentEntityReference;
    resolve: (
      entity: import("@tau/db-schema/content-identities").ContentEntityReference
    ) => number | null;
  }
) {
  if (req.domain === "mindmap")
    return new MindmapAgentCandidate(
      model,
      req,
      ids,
      contracts,
      notes?.reference,
      notes?.resolve
    ).execute();
  const { builtins, paragraph } = contracts;
  const page = model.read().pages.find(p => p.id === req.pageId);
  if (!page) throw new Error("目标页面已失效");
  const existing = new Map(pageElements(page.children).map(node => [node.id, node]));
  const locations = new Map<string, WhiteboardGeometry>();
  const commands: WhiteboardModelCommand[] = [];
  const connections: (() => WhiteboardModelCommand)[] = [];
  const types = new Set<string>();
  const edits: { node: WhiteboardElementSnapshot; old: string; text: string }[] = [];
  const changed = new Set<string>();
  const lookup = (value: unknown) => {
    const id = key(value);
    return ids.get(id) ?? id;
  };
  const target = (value: unknown) => {
    const node = existing.get(lookup(value));
    if (!node || builtins.types[node.type]?.contractId !== node.contractId)
      throw new Error("目标已变化或元素类型不支持编辑");
    return node;
  };
  const pos = (value: unknown) => locations.get(lookup(value)) ?? target(value).geometry;

  for (const op of req.operations) {
    if (op.kind === "shape" || op.kind === "text" || op.kind === "connect") {
      const id = lookup(op.id);
      if (existing.has(key(op.id))) throw new Error("临时名称与已有元素身份重复");
      const type = op.kind === "shape" ? "geometry" : op.kind === "text" ? "richtext" : "arrow";
      types.add(type);
      const create = {
        type: "create" as const,
        id,
        contractId: builtins.types[type].contractId,
        parent: { kind: "page" as const, id: page.id },
      };
      if (op.kind === "connect") {
        pos(op.from);
        pos(op.to);
        if (lookup(op.from) === lookup(op.to)) throw new Error("连线两端必须不同");
        connections.push(() => {
          const a = pos(op.from),
            b = pos(op.to);
          const points = [
            { x: a.x + a.width, y: a.y + a.height / 2 },
            { x: b.x, y: b.y + b.height / 2 },
          ];
          return {
            ...create,
            geometry: arrowBounds(points),
            data: {
              lineType: "straight",
              lineWidth: 2,
              points,
              source: { bindId: lookup(op.from), connectId: "right", marker: "none" },
              target: { bindId: lookup(op.to), connectId: "left", marker: "arrow" },
            },
          };
        });
      } else {
        const geometry = readGeometry(op.geometry),
          label = textValue(op.text ?? "");
        const shape = op.shape ?? "rectangle";
        if (shape !== "rectangle" && shape !== "capsule" && shape !== "cylinder")
          throw new Error("形状类型无效");
        locations.set(id, geometry);
        commands.push({
          ...create,
          geometry,
          data:
            type === "geometry"
              ? {
                  geometryType: shape,
                  paths: [],
                  text: { align: "center" },
                  fill: "#ffffff",
                  stroke: "#444444",
                  strokeWidth: 2,
                }
              : { maxWidth: geometry.width, resized: true },
          body: [{ type: "paragraph", tauContract: paragraph.id, children: [{ text: label }] }],
        });
      }
      continue;
    }
    const node = target(op.id);
    if (changed.has(node.id)) throw new Error("同一批次对同一已有对象只允许一次修改");
    changed.add(node.id);
    if (op.kind === "move") {
      const expected = readGeometry(op.before);
      if (!coordKeys.every(k => node.geometry[k] === expected[k]))
        throw new Error("位置冲突，请重读 " + node.id);
      if (node.type === "arrow" || node.children.length)
        throw new Error("请移动独立图形或连线端点所属元素");
      const geometry = readGeometry(op.geometry);
      locations.set(node.id, geometry);
      commands.push({ type: "set_node", id: node.id, patch: { geometry } });
    } else if (op.kind === "label") {
      const old = simpleLabel(node);
      if (old === undefined || old !== op.beforeText)
        throw new Error("文字冲突或含复杂格式，请重读 " + node.id);
      const text = textValue(op.text);
      if (node.type === "frame" || node.type === "column")
        commands.push({
          type: "edit_text",
          id: node.id,
          field: "title",
          edit: { offset: 0, remove: old.length, text },
        });
      else edits.push({ node, old, text });
    } else if (op.kind === "delete") {
      if (
        req.operations.length !== 1 ||
        node.children.length ||
        node.entity ||
        [...existing.values()].some(
          item =>
            item.type === "arrow" &&
            [endpointId(item.data.source), endpointId(item.data.target)].includes(node.id)
        )
      )
        throw new Error("请先解除连线或单独处理子元素及引用");
      if (op.beforeRevision === undefined) throw new Error("删除需要读取时的修订");
      commands.push({ type: "remove_nodes", ids: [node.id] });
    } else throw new Error("未知白板操作");
  }
  updateConnectedArrows(existing, locations, commands);
  commands.push(...connections.map(create => create()));
  if (commands.length)
    model.submit(commands, "agent", [
      ...builtins.prepared.filter(c => types.has(c.contract.type)),
      ...(types.has("geometry") || types.has("richtext") ? [paragraph] : []),
    ]);
  for (const { node, old, text } of edits) {
    const tree = model.richText(node.id),
      block = tree.read()[0];
    if (typeof block.collabId !== "string") throw new Error("缺少文字块身份");
    if (old.length) tree.deleteText(block.collabId, 0, old.length, "agent");
    if (text.length) tree.insertText(block.collabId, 0, text, "agent");
  }
}
