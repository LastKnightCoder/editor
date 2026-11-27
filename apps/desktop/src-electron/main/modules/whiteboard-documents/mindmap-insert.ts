import type { MindmapAgentCandidate } from "./mindmap-agent";
import type { Operation } from "./mindmap-agent-utils";
import {
  prepareWhiteboardTransfer,
  type WhiteboardTransfer,
  type WhiteboardJson,
  type WhiteboardData,
  type WhiteboardModelCommand,
} from "@tau/collaboration";
import { markdownToOutline, type MindOutline } from "@tau/whiteboard/mindmap";
import { mindKeys, mindObject, mindError, mindString } from "../../../../shared/whiteboard-mindmap";
import { hash, stripIdentity, anchor, type Outline, type Placement } from "./mindmap-agent-utils";
import { moveMindNode } from "./mindmap-structure";

export function insertMindNodes(ctx: MindmapAgentCandidate, op: Operation) {
  mindKeys(
    op,
    [
      "kind",
      "id",
      "parentId",
      "beforeId",
      "afterId",
      "side",
      "at",
      "text",
      "content",
      "markdown",
      "sourceId",
      "transfer",
    ],
    "operation"
  );
  if (op.transfer !== undefined) return importMindTransfer(ctx, op);
  const id = ctx.created(op.id),
    placement = ctx.placement(op);
  const formats = ["text", "content", "markdown", "sourceId"].filter(key => op[key] !== undefined);
  if (formats.length > 1)
    mindError("AMBIGUOUS_CONTENT", "text、content、markdown、sourceId 只能提供一项", {
      path: "text",
      actual: formats,
    });
  const at = op.at === undefined ? undefined : mindObject(op.at, "at");
  if (
    at &&
    placement.parent.kind === "element" &&
    ctx.node(placement.parent.id, "parentId", false).type === "mind-node"
  )
    mindError("DERIVED_POSITION", "导图子节点的位置由布局计算，不能指定 at", {
      path: "at",
      suggestion: "省略 at，通过 parentId、beforeId、afterId 和 side 指定分支位置。",
    });
  if (placement.parent.kind === "page" && !at)
    mindError("POSITION_REQUIRED", "新建独立导图需要根节点位置 at", {
      path: "at",
      expected: { x: "number", y: "number" },
      suggestion:
        "从 get_whiteboard_context 的 viewport 选择空白位置，传入 at: {x,y}。子节点无需坐标。",
    });
  const coordinate = (value: unknown, path: string) => {
    if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e9)
      mindError("INVALID_ARGUMENT", `${path} 必须是有限坐标`, { path, actual: value });
    return value;
  };
  const position = {
    x: at ? coordinate(at.x, "at.x") : 0,
    y: at ? coordinate(at.y, "at.y") : 0,
    width: 24,
    height: 52,
    rotation: 0,
  };
  const source = op.sourceId === undefined ? undefined : ctx.node(op.sourceId, "sourceId", false);
  if (source && (source.type !== "richtext" || source.entity || source.children.length))
    mindError("UNSUPPORTED_CONVERSION", "只能把独立的原生文本框转换成导图节点", {
      path: "sourceId",
      actual: source.type,
    });
  if (source) ctx.guard(source.id, "subtree");
  let outline: Outline[];
  if (op.markdown !== undefined) {
    const parsed = markdownToOutline(mindString(op.markdown, "markdown", 131072));
    if (parsed.truncated)
      mindError("IMPORT_LIMIT_EXCEEDED", "Markdown 超过单次可导入节点数，未导入任何内容", {
        path: "markdown",
        suggestion: "将大纲按有意义的分支拆成多个批次，不能依赖截断导入。",
      });
    if (!parsed.outline.length)
      mindError("EMPTY_OUTLINE", "Markdown 没有可导入的大纲节点", { path: "markdown" });
    outline = parsed.outline.map(node => mindOutline(ctx, node));
    if (outline.length > 1 && placement.parent.kind === "page")
      outline = [{ text: ctx.body("中心主题"), children: outline }];
  } else
    outline = [
      {
        text:
          source && Array.isArray(source.body)
            ? source.body.map(stripIdentity)
            : ctx.body(op.content ?? op.text ?? ""),
        children: [],
      },
    ];
  const commands: WhiteboardModelCommand[] = [];
  const create = (entries: Outline[], parent: Placement["parent"], prefix: string) => {
    let afterId = placement.afterId;
    entries.forEach((entry, i) => {
      const path = `${prefix}.${i}`;
      const nodeId = prefix === "" && i === 0 ? id : "agent-" + hash([id, path]);
      commands.push({
        type: "create",
        id: nodeId,
        contractId: ctx.contracts.builtins.types["mind-node"].contractId,
        parent,
        ...(prefix === "" ? anchor(placement.beforeId, afterId) : {}),
        geometry: position,
        data: { direction: placement.direction, isLeftFold: false, isRightFold: false },
        body: entry.text,
      });
      if (prefix === "" && afterId !== undefined) afterId = nodeId;
      create(entry.children, { kind: "element", id: nodeId }, path);
    });
  };
  create(outline, placement.parent, "");
  ctx.submit(commands);
  ctx.expandParent(placement);
  if (source) ctx.removeIds(new Set([source.id]));
}

export function mindOutline(ctx: MindmapAgentCandidate, node: MindOutline): Outline {
  return {
    text: ctx.body(node.text),
    children: node.children.map(child => mindOutline(ctx, child)),
  };
}

export async function importMindTransfer(ctx: MindmapAgentCandidate, op: Operation) {
  const id = ctx.created(op.id);
  ctx.placement(op);
  if (["text", "content", "markdown", "sourceId"].some(key => op[key] !== undefined))
    mindError("AMBIGUOUS_CONTENT", "transfer 不能与其他正文来源同时提供", { path: "transfer" });
  const value = mindObject(op.transfer, "transfer");
  if (!Array.isArray(value.pages))
    mindError("INVALID_TRANSFER", "transfer 缺少 pages", { path: "transfer.pages" });
  const entries = value.pages.flatMap(page => {
    const p = mindObject(page, "transfer.pages");
    return Array.isArray(p.elements) ? p.elements : [];
  });
  const roots = entries.filter(
    entry => mindObject(entry, "transfer.elements").type === "mind-node"
  );
  if (
    roots.length !== 1 ||
    entries.some(
      entry => !["mind-node", "arrow"].includes(String(mindObject(entry, "transfer.elements").type))
    )
  )
    mindError("INVALID_TRANSFER_SCOPE", "一次导图导入必须包含一棵原生导图及可选联系线", {
      path: "transfer.pages",
      actual: { roots: roots.length },
      suggestion: "逐棵导图导入；普通白板元素使用通用白板工具。",
    });
  if (Array.isArray(value.resources) && value.resources.length)
    mindError("TRANSFER_RESOURCES_UNSUPPORTED", "导图工具不直接搬运附件资源", {
      path: "transfer.resources",
      suggestion: "通过白板现有导入流程搬运带附件的可编辑白板。",
    });
  const rootId = mindString(mindObject(roots[0], "transfer.root").id, "transfer.root.id", 256);
  const header = (input: unknown): input is WhiteboardTransfer => {
    if (!input || typeof input !== "object") return false;
    return (
      "format" in input &&
      input.format === "whiteboard-transfer-v1" &&
      "sourceDocumentId" in input &&
      typeof input.sourceDocumentId === "string" &&
      "title" in input &&
      typeof input.title === "string" &&
      "pages" in input &&
      Array.isArray(input.pages) &&
      "resources" in input &&
      Array.isArray(input.resources) &&
      "presentations" in input &&
      Array.isArray(input.presentations) &&
      "contracts" in input &&
      Boolean(input.contracts)
    );
  };
  if (!header(value))
    mindError("INVALID_TRANSFER", "transfer 不符合可编辑白板格式", {
      path: "transfer",
      suggestion: "使用 read_whiteboard_mindmap format=transfer 的完整输出，不要手写契约字典。",
    });
  const prepared = await prepareWhiteboardTransfer(ctx.model, value, {
    pageId: ctx.page().id,
    targetDocumentId: "agent-mindmap",
    knownContractIds: new Set(
      Object.values(ctx.contracts.builtins.types).map(entry => entry.contractId)
    ),
  });
  const generatedRoot = prepared.ids.get(rootId);
  if (!generatedRoot) mindError("INVALID_TRANSFER", "未能创建导图根节点", { path: "transfer" });
  const mapping = new Map(
    [...prepared.ids].map(([old, generated]) => [
      generated,
      old === rootId ? id : "agent-" + hash([id, old]),
    ])
  );
  const replace = (value: WhiteboardJson): WhiteboardJson => {
    if (Array.isArray(value)) return value.map(replace);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        ["bindId", "startId", "endId"].includes(key) && typeof item === "string"
          ? (mapping.get(item) ?? item)
          : replace(item),
      ])
    );
  };
  const commands = prepared.commands.map(command => {
    if (command.type === "create")
      return {
        ...command,
        id: command.id && mapping.get(command.id),
        parent:
          command.parent.kind === "element"
            ? { ...command.parent, id: mapping.get(command.parent.id) ?? command.parent.id }
            : command.parent,
      };
    if (command.type === "set_data")
      return {
        ...command,
        id: mapping.get(command.id) ?? command.id,
        patch: replace(command.patch) as WhiteboardData,
      };
    if (command.type === "set_node" || command.type === "edit_text")
      return { ...command, id: mapping.get(command.id) ?? command.id };
    return command;
  });
  ctx.model.submitChunks(
    commands,
    "agent",
    prepared.prepared,
    prepared.initialBodies.map(entry => ({ ...entry, id: mapping.get(entry.id) ?? entry.id }))
  );
  moveMindNode(ctx, {
    kind: "move",
    id: op.id,
    ...(op.parentId === undefined ? {} : { parentId: op.parentId }),
    ...(op.beforeId === undefined ? {} : { beforeId: op.beforeId }),
    ...(op.afterId === undefined ? {} : { afterId: op.afterId }),
    ...(op.side === undefined ? {} : { side: op.side }),
    ...(op.at === undefined ? {} : { at: op.at }),
  });
}
