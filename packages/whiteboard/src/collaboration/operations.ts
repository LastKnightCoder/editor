import type {
  WhiteboardModelCommand,
  WhiteboardData,
  WhiteboardGeometry,
  WhiteboardParent,
  WhiteboardAnchor,
} from "@tau/collaboration";
import PathUtil from "../utils/PathUtil";
import BoardOperations from "../utils/BoardOperations";
import type { Operation } from "../types/operation";
import type { BoardElement } from "../types/element";
import { refresh, resolveArrowBindings, flatten, equal, authorElement } from "./projection";
import { assertWritable, canEditElement } from "./element-access";
import { captureFeedback, applyFeedback, scheduleGesture } from "./gesture";
import { compact } from "./commands";
import { observeRemovals } from "./removals";
import type { CanvasBinding } from "./binding";

const bodyValue = (node: Record<string, unknown>, path: string) =>
  path
    .split(".")
    .reduce<unknown>(
      (value, key) => (value == null ? undefined : (value as Record<string, unknown>)[key]),
      node
    );
const canvasValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canvasValue);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype)
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, canvasValue(item)])
    );
  return value;
};
export const geometryKeys = ["x", "y", "width", "height", "rotation"] as const;
const anchorBefore = (id?: string): WhiteboardAnchor => (id === undefined ? {} : { beforeId: id });

export function apply(
  binding: CanvasBinding,
  operations: Operation[],
  updateHistory: boolean,
  historyGroup?: string
): boolean {
  if (binding.closed) return true;
  const content = operations.some(
    op => !["set_selection", "set_viewport", "set_moving"].includes(op.type)
  );
  if (!content) return false;
  assertWritable(binding);
  const board = binding.board;
  if (!board) throw new Error("画布尚未挂载");
  // 派生尺寸/布局只能改变本机投影，不能把 updateHistory=false 当作无历史的共享写入口。
  if (!binding.gesture && !updateHistory) {
    for (const operation of operations)
      if (operation.type === "set_node") {
        const node = PathUtil.getElement(board.children, operation.path);
        if (node) applyFeedback(binding, captureFeedback(binding, node, operation.newProperties));
      }
    return false;
  }
  if (
    operations.some(
      op =>
        op.type !== "set_node" ||
        Object.keys(op.newProperties).some(
          key => !geometryKeys.includes(key as (typeof geometryKeys)[number])
        )
    )
  ) {
    board.framePresentation.flush();
    board.framePresentation.end();
  }
  const { commands, children, feedback } = compile(binding, operations);
  if (binding.gesture) {
    binding.pending = compact([...binding.pending, ...commands]);
    binding.pendingFeedback.push(...feedback);
    board.publishDocument(resolveArrowBindings(binding, children));
    scheduleGesture(binding);
  } else {
    if (commands.length) binding.submit(commands, historyGroup);
    if (feedback.length) {
      applyFeedback(binding, feedback);
      refresh(binding);
    }
  }
  const local = operations.filter(op =>
    ["set_selection", "set_viewport", "set_moving"].includes(op.type)
  );
  if (local.length) board.apply(local, false);
  return true;
}

/** 画框显示独立于数据投影，按节奏合并位移并在松手冲刷末位置。 */
export function previewFramePosition(
  binding: CanvasBinding,
  id: string,
  x: number,
  y: number
): BoardElement | undefined {
  const board = assertWritable(binding, false);
  if (!binding.gesture) return;
  const index = board.children.findIndex(node => node.id === id);
  const current = board.children[index];
  if (!current || current.type !== "frame") return;
  const dx = x - current.x,
    dy = y - current.y;
  const commands: WhiteboardModelCommand[] = [];
  const move = (node: BoardElement): BoardElement => {
    const geometry = authorElement(binding, node.id)?.geometry;
    if (!geometry) throw new Error("画框子节点身份已变化");
    const next = {
      ...node,
      x: node.x + dx,
      y: node.y + dy,
      ...(node.children ? { children: node.children.map(move) } : {}),
    };
    commands.push({
      type: "set_node",
      id: node.id,
      patch: {
        geometry: binding.model.geometryValue(
          next.x,
          next.y,
          geometry.width,
          geometry.height,
          geometry.rotation
        ),
      },
    });
    return next;
  };
  const next = move(current);
  const children = [...board.children];
  children[index] = next;
  if (
    !binding.pending.length ||
    (binding.framePending?.rootId === id && binding.framePending.commands === binding.pending)
  ) {
    binding.pending = commands;
    binding.framePending = { rootId: id, commands };
  } else {
    binding.pending = compact([...binding.pending, ...commands]);
    binding.framePending = undefined;
  }
  board.publishDocument(resolveArrowBindings(binding, children));
  scheduleGesture(binding);
  return next;
}

export function commitPreview(
  binding: CanvasBinding,
  operations: Operation[],
  historyGroup?: string
): void {
  assertWritable(binding);
  const { commands } = compile(binding, operations);
  if (binding.gesture) {
    binding.pending = compact([...binding.pending, ...commands]);
    scheduleGesture(binding);
  } else if (commands.length) binding.submit(commands, historyGroup);
}

export function canvasGeometry(node: BoardElement): WhiteboardGeometry {
  if (node.type === "arrow" && Array.isArray(node.points) && node.points.length) {
    const xs = node.points.map((p: { x: number }) => p.x),
      ys = node.points.map((p: { y: number }) => p.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      rotation: node.rotation ?? 0,
    };
  }
  return {
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    rotation: node.rotation ?? 0,
  };
}

export function compile(
  binding: CanvasBinding,
  operations: Operation[]
): {
  commands: WhiteboardModelCommand[];
  children: BoardElement[];
  feedback: { id: string; patch: Record<string, unknown> }[];
} {
  const board = binding.board;
  if (!board) throw new Error("画布尚未挂载");
  let children = board.children;
  const commands: WhiteboardModelCommand[] = [];
  const feedback: { id: string; patch: Record<string, unknown> }[] = [];
  const removalIds = observeRemovals(binding, commands, binding.pending);
  const parentAt = (path: number[]): WhiteboardParent => {
    if (path.length === 1) return { kind: "page", id: binding.page };
    const parent = PathUtil.getElement(children, path.slice(0, -1));
    if (!parent) throw new Error("路径父级已失效");
    return { kind: "element", id: parent.id };
  };
  const batch = BoardOperations.applyOperations(
    { children, selection: board.selection, viewPort: board.viewPort, sketch: board.sketch },
    operations
  );
  const prepared = batch.operations;
  const patchOnly = prepared.every(op =>
    ["set_node", "set_selection", "set_viewport", "set_moving"].includes(op.type)
  );
  const shadows = new Map<string, BoardElement>();
  const advance = BoardOperations.preparedChildren(children);
  const geometries = new Map<string, WhiteboardGeometry>();
  const isContent = (op: Operation) =>
    !["set_selection", "set_viewport", "set_moving"].includes(op.type);
  if (prepared.filter(isContent).length !== operations.filter(isContent).length)
    throw new Error("批次包含失效路径或不可执行的内容操作");
  for (const operation of prepared) {
    const old =
      "path" in operation && operation.type !== "insert_node"
        ? ((patchOnly && shadows.size ? shadows.get(operation.path.join("/")) : undefined) ??
          PathUtil.getElement(children, operation.path))
        : undefined;
    let next = children;
    if (operation.type === "set_node") {
      if (!old) throw new Error("属性目标已失效");
      commands.push(...patch(binding, old, operation.newProperties, geometries));
      if (
        patchOnly &&
        !Object.keys(operation.newProperties).every(key =>
          geometryKeys.includes(key as (typeof geometryKeys)[number])
        )
      ) {
        const shadow = { ...old };
        for (const [key, value] of Object.entries(operation.newProperties)) {
          if (value == null) delete shadow[key];
          else shadow[key] = value;
        }
        shadows.set(operation.path.join("/"), shadow);
      }
      feedback.push(...captureFeedback(binding, old, operation.newProperties));
    } else if (operation.type === "remove_node") {
      if (!old || old.id !== operation.node.id) throw new Error("删除观察目标已失效");
      commands.push({
        type: "remove_nodes",
        ids: removalIds([old.id]),
      });
    } else if (operation.type === "insert_node") {
      const parent = parentAt(operation.path);
      const peers =
        operation.path.length === 1
          ? children
          : (PathUtil.getElement(children, operation.path.slice(0, -1))?.children ?? []);
      const anchor = peers[operation.path[operation.path.length - 1]];
      creation(binding, operation.node, parent, anchor?.id, commands);
      for (const node of flatten([operation.node]))
        feedback.push(...captureFeedback(binding, node, node));
    } else if (operation.type === "move_node") {
      if (!old) throw new Error("移动目标已失效");
      const priorParent =
        operation.path.length > 1
          ? PathUtil.getElement(children, operation.path.slice(0, -1))
          : undefined;
      const takeVisibleGeometry = priorParent && ["column", "mind-node"].includes(priorParent.type);
      next = advance(operation);
      const destination = PathUtil.transformPath([...operation.newPath], {
        type: "remove_node",
        path: operation.path,
        node: old,
      });
      if (!destination) throw new Error("移动结果路径已失效");
      const parentNode =
        destination.length > 1 ? PathUtil.getElement(next, destination.slice(0, -1)) : undefined;
      const nodes = destination.length === 1 ? next : parentNode?.children;
      if (!nodes) throw new Error("移动结果缺少父级");
      const index = Math.min(destination[destination.length - 1], nodes.length - 1);
      const parent: WhiteboardParent = parentNode
        ? { kind: "element", id: parentNode.id }
        : { kind: "page", id: binding.page };
      if (nodes[index]?.id !== old.id) throw new Error("移动结果缺少原身份");
      if (takeVisibleGeometry && (parent.kind !== "element" || parent.id !== priorParent.id)) {
        geometries.set(old.id, canvasGeometry(old));
        commands.push({
          type: "set_node",
          id: old.id,
          patch: { geometry: canvasGeometry(old) },
        });
      }
      const codec = binding.options.types[old.type];
      if (
        old.type === "column" &&
        parent.kind === "element" &&
        old.contractId !== codec?.contractId &&
        codec?.previousContractIds?.includes(old.contractId)
      )
        commands.push({ type: "upgrade_column", id: old.id, contractId: codec.contractId });
      commands.push({
        type: "move_node",
        id: old.id,
        parent,
        ...anchorBefore(nodes[index + 1]?.id),
      });
    } else if (operation.type === "set_sketch")
      commands.push({
        type: "set_page_sketch",
        id: binding.page,
        sketch: { ...board.sketch, ...operation.newProperties },
      });
    if (!patchOnly && operation.type !== "move_node") next = advance(operation);
    children = next;
  }
  return { commands, children: patchOnly ? batch.data.children : children, feedback };
}

export function bodyContent(binding: CanvasBinding, value: unknown): unknown {
  const editorVersions = binding.options.editorVersions;
  if (!Array.isArray(value) || !editorVersions) return value;
  return value.map(node => {
    if (!node || typeof node !== "object" || !Array.isArray(node.children)) return node;
    const contractId = node.tauContract ?? editorVersions.current(node.type)?.id;
    if (!contractId) throw new Error("正文节点尚未声明协作版本");
    return { ...node, tauContract: contractId, children: bodyContent(binding, node.children) };
  });
}

export function creation(
  binding: CanvasBinding,
  node: BoardElement,
  parent: WhiteboardParent,
  beforeId: string | undefined,
  commands: WhiteboardModelCommand[]
): void {
  const codec = binding.options.types[node.type];
  const contractId =
    typeof node.contractId === "string"
      ? node.contractId
      : (codec?.contractId ?? binding.options.catalog?.current(node.type)?.id);
  const contract =
    contractId &&
    (binding.model.contracts.get(contractId) ??
      binding.options.catalog?.get(contractId)?.contract ??
      binding.options.preparedContracts?.find(entry => entry.id === contractId)?.contract);
  if (!contract || contract.domain !== "whiteboard-element" || contract.type !== node.type)
    throw new Error("元素类型尚未声明画布契约");
  const data: Record<string, unknown> = { ...(node.data ?? {}) };
  const allowed = new Set([
    "id",
    "contractId",
    "dataVersion",
    "body",
    "entity",
    "type",
    "children",
    "name",
    "data",
    "style",
    ...geometryKeys,
    ...(codec?.dataProperties ?? []),
    ...(codec?.transientProperties ?? []),
    ...(codec?.bodyProperty ? [codec.bodyProperty.split(".")[0]] : []),
  ]);
  if (Object.keys(node).some(key => !allowed.has(key))) throw new Error("创建包含未分类的画布属性");
  for (const key of codec?.dataProperties ?? [])
    if (node[key] !== undefined) data[key] = canvasValue(node[key]);
  if (codec?.bodyProperty?.includes(".")) {
    const [head, tail] = codec.bodyProperty.split(".");
    const rest = { ...((data[head] as Record<string, unknown>) ?? {}) };
    delete rest[tail];
    data[head] = rest;
  }
  if (node.type === "video" && (data.metaInfo as { type?: string } | undefined)?.type === "local")
    data.metaInfo = { type: "local" };
  commands.push({
    type: "create",
    id: node.id,
    contractId: contractId as string,
    geometry: canvasGeometry(node),
    data: data as WhiteboardData,
    parent,
    ...anchorBefore(beforeId),
    ...(contract.structure.text !== "none"
      ? {
          body: bodyContent(
            binding,
            node.body ??
              (codec?.bodyProperty ? bodyValue(node, codec.bodyProperty) : undefined) ??
              (contract.structure.text === "plain" ? "" : [])
          ) as string | readonly import("@tau/collaboration").ContentNode[],
        }
      : {}),
    ...(node.entity
      ? {
          entity: node.entity as import("@tau/db-schema/content-identities").ContentEntityReference,
        }
      : {}),
  });
  if (node.name !== undefined || node.style !== undefined)
    commands.push({
      type: "set_node",
      id: node.id,
      patch: {
        ...(node.name !== undefined ? { name: node.name } : {}),
        ...(node.style ? { style: node.style } : {}),
      },
    });
  for (const child of node.children ?? [])
    creation(binding, child, { kind: "element", id: node.id }, undefined, commands);
}

export function patch(
  binding: CanvasBinding,
  node: BoardElement,
  patch: Record<string, unknown>,
  geometries?: Map<string, WhiteboardGeometry>
): WhiteboardModelCommand[] {
  if (!Object.keys(patch).length) return [];
  if (
    Object.keys(patch).every(key => geometryKeys.includes(key as (typeof geometryKeys)[number]))
  ) {
    const value = {
      ...(geometries?.get(node.id) ??
        authorElement(binding, node.id)?.geometry ??
        canvasGeometry(node)),
      ...patch,
    } as WhiteboardGeometry;
    const owned = binding.model.geometryValue(
      value.x,
      value.y,
      value.width,
      value.height,
      value.rotation
    );
    geometries?.set(node.id, owned);
    return [{ type: "set_node", id: node.id, patch: { geometry: owned } }];
  }
  const codec = binding.options.types[node.type];
  const currentContract = canEditElement(binding, node.id);
  const commands: WhiteboardModelCommand[] = [],
    data: Record<string, unknown> = {},
    unset = new Set<string>();
  const shell: { name?: string; geometry?: WhiteboardGeometry; style?: WhiteboardData } = {};
  for (const [key, original] of Object.entries(patch)) {
    let value =
      node.type === "video" &&
      key === "metaInfo" &&
      (original as { type?: string })?.type === "local"
        ? { type: "local" }
        : original;
    if (codec?.bodyProperty?.startsWith(`${key}.`)) {
      const leaf = codec.bodyProperty.slice(key.length + 1);
      if (
        !equal(bodyValue({ [key]: value }, codec.bodyProperty), bodyValue(node, codec.bodyProperty))
      )
        throw new Error("富文本必须通过文档绑定增量编辑");
      value = { ...(value as Record<string, unknown>) };
      delete (value as Record<string, unknown>)[leaf];
    }
    if (codec?.transientProperties?.includes(key)) continue;
    if (key === codec?.bodyProperty) {
      if (!equal(value, node[key])) throw new Error("富文本必须通过文档绑定增量编辑");
      continue;
    }
    if (geometryKeys.includes(key as (typeof geometryKeys)[number])) {
      if (shell.geometry) continue;
      shell.geometry = {
        ...(geometries?.get(node.id) ??
          authorElement(binding, node.id)?.geometry ??
          canvasGeometry(node)),
        ...Object.fromEntries(
          Object.entries(patch).filter(([field]) =>
            geometryKeys.includes(field as (typeof geometryKeys)[number])
          )
        ),
      } as WhiteboardGeometry;
      geometries?.set(node.id, shell.geometry);
      continue;
    }
    if (key === "name") {
      if (typeof value !== "string") throw new Error("名称必须是字符串");
      shell.name = value;
      continue;
    }
    if (key === "style") {
      shell.style = value as WhiteboardData;
      continue;
    }
    if (key === "data") {
      if (!currentContract) throw new Error("当前元素契约不支持内部编辑");
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("数据补丁无效");
      for (const name of new Set([...Object.keys(node.data ?? {}), ...Object.keys(value)])) {
        const entry = (value as Record<string, unknown>)[name];
        if (equal(entry, node.data?.[name])) continue;
        if (entry === undefined) unset.add(name);
        else data[name] = entry;
      }
      continue;
    }
    if (!currentContract || !codec?.dataProperties?.includes(key))
      throw new Error("属性未声明持久归属");
    if (codec.recordProperties?.includes(key)) {
      commands.push({
        type: "patch_records",
        id: node.id,
        field: key,
        before: (node[key] ?? []) as WhiteboardData[],
        after: (value ?? []) as WhiteboardData[],
      });
      continue;
    }
    if (value == null) unset.add(key);
    else data[key] = canvasValue(value);
  }
  if (node.type === "arrow" && Object.hasOwn(data, "points"))
    shell.geometry = canvasGeometry({ ...node, points: data.points });
  if (node.type === "handwrite" && node.data?.segmented === true && Object.hasOwn(data, "points"))
    data.segmented = false;
  if (Object.keys(shell).length) commands.push({ type: "set_node", id: node.id, patch: shell });
  if (Object.keys(data).length || unset.size)
    commands.push({
      type: "set_data",
      id: node.id,
      patch: data as WhiteboardData,
      unset: [...unset],
    });
  return commands;
}
