import * as Y from "yjs";
import { buildHandwriteElement } from "../extensions/creators/handwrite";
import type { WhiteboardModelCommand, WhiteboardData } from "@tau/collaboration";
import { contentResourceSlots, contentResourceValues } from "@tau/db-schema/content-resources";
import { isSafeResource } from "@tau/collaboration";
import { flattenModel, flatten, authorElement, refresh } from "./projection";
import { assertWritable, canEditElement } from "./element-access";
import type { CanvasBinding } from "./binding";

export function splitHistory(binding: CanvasBinding): void {
  binding.history.stopCapturing();
  binding.group = undefined;
}

export function enterGroup(binding: CanvasBinding, group?: string): void {
  if (group === undefined || group !== binding.group) binding.history.stopCapturing();
  binding.group = group;
}

export function submit(
  binding: CanvasBinding,
  commands: readonly WhiteboardModelCommand[],
  historyGroup?: string,
  extraPrepared: readonly (
    | import("@tau/db-schema/content-contracts").PreparedContentContract
    | import("@tau/db-schema/content-contracts").PreparedWhiteboardContract
  )[] = []
) {
  assertWritable(binding, false);
  if (binding.gesture && !binding.streamingGesture) {
    binding.board?.interactions.cancel();
    binding.endGesture(false);
  }
  const origin = (binding.streamingGesture && binding.gestureHistory) || binding.origin;
  const bodyContracts = new Set<string>();
  const collect = (nodes: readonly import("@tau/collaboration").ContentNode[]) => {
    for (const node of nodes) {
      if (typeof node.tauContract === "string") bodyContracts.add(node.tauContract);
      if (node.children) collect(node.children);
    }
  };
  for (const command of commands)
    if (command.type === "create" && Array.isArray(command.body)) collect(command.body);
  const prepared = [
    ...extraPrepared,
    ...(binding.options.preparedContracts ?? []).filter(entry => bodyContracts.has(entry.id)),
    ...commands.flatMap(command =>
      command.type === "create" && !binding.model.contracts.has(command.contractId)
        ? [
            binding.options.catalog?.get(command.contractId)?.prepared ??
              binding.options.preparedContracts?.find(entry => entry.id === command.contractId),
          ].filter(
            (
              entry
            ): entry is
              | import("@tau/db-schema/content-contracts").PreparedWhiteboardContract
              | import("@tau/db-schema/content-contracts").PreparedContentContract => !!entry
          )
        : []
    ),
  ];
  binding.validating = true;
  try {
    binding.model.preflight(candidate => {
      const created = candidate.submit(commands, origin, prepared).createdIds;
      const touched = new Set([
        ...created,
        ...commands.flatMap(command => (command.type === "set_data" ? [command.id] : [])),
      ]);
      const snapshot = candidate.read();
      const catalog = binding.options.catalog;
      for (const node of flattenModel([
        ...snapshot.pages.flatMap(page => [...page.children, ...page.recovery]),
        ...snapshot.recovery,
      ])) {
        const entry = catalog?.get(node.contractId);
        if (touched.has(node.id)) {
          const contract = candidate.contracts.get(node.contractId);
          if (!contract) throw new Error("白板快照缺少节点契约");
          for (const slot of contentResourceSlots(node.data, contract.resources))
            for (const reference of contentResourceValues(slot))
              if (!isSafeResource(reference))
                throw new Error("资源须先交由宿主管理，不能写入本机路径或凭据");
        }
        if (touched.has(node.id) && entry?.access === "edit" && catalog)
          catalog.validate(entry, node.data);
      }
    });
  } finally {
    binding.validating = false;
  }
  if (!binding.streamingGesture) enterGroup(binding, historyGroup);
  binding.writing = true;
  try {
    return binding.model.submit(commands, origin, prepared);
  } finally {
    binding.writing = false;
    refresh(binding);
  }
}

export function appendStroke(
  binding: CanvasBinding,
  id: string,
  points: readonly import("../utils/HandwriteUtil").HandwriteInputPoint[],
  style: import("../utils/HandwriteUtil").HandwriteStyle
): void {
  assertWritable(binding);
  if (!points.length || points.length > 128) throw new Error("笔迹分段超过预算");
  const parent = binding.model.elements.get(id),
    contractId = binding.options.types.handwrite?.contractId,
    segmentContract = binding.options.types["host.whiteboard.stroke-segment"]?.contractId;
  if (!contractId || !segmentContract) throw new Error("笔迹契约未就绪");
  const all = [
    ...(authorElement(binding, id)?.children.flatMap(
      segment =>
        segment.data.points as unknown as import("../utils/HandwriteUtil").HandwriteInputPoint[]
    ) ?? []),
    ...points,
  ];
  const stroke = buildHandwriteElement(all, style, id);
  if (!stroke) throw new Error("笔迹首段至少需要两个点");
  const geometry = {
    x: stroke.x,
    y: stroke.y,
    width: stroke.width,
    height: stroke.height,
    rotation: 0,
  };
  const commands: WhiteboardModelCommand[] = [];
  if (!parent)
    commands.push(
      {
        type: "create",
        id,
        contractId,
        data: { segmented: true, points: [], outline: [] },
        geometry,
        parent: { kind: "page", id: binding.page },
      },
      { type: "set_node", id, patch: { name: "手写", style: style as unknown as WhiteboardData } }
    );
  else if (
    (parent.get("identity") as { contractId: string }).contractId !== contractId ||
    (parent.get("data") as Y.Map<unknown>).get("segmented") !== true
  )
    throw new Error("笔迹身份冲突");
  if (parent) commands.push({ type: "set_node", id, patch: { geometry } });
  commands.push({
    type: "create",
    contractId: segmentContract,
    data: { points: points as unknown as import("@tau/db-schema/content-contracts").DataJson },
    geometry,
    parent: { kind: "element", id },
  });
  enterGroup(binding, `stroke:${id}`);
  binding.writing = true;
  try {
    binding.model.submit(
      commands,
      binding.origin,
      binding.options.preparedContracts?.filter(
        entry => entry.id === contractId || entry.id === segmentContract
      )
    );
  } finally {
    binding.writing = false;
    refresh(binding);
  }
}

export function cancelStroke(binding: CanvasBinding, id: string): void {
  if (
    binding.closed ||
    binding.receiving ||
    binding.board?.readonly ||
    binding.options.canWrite?.() === false
  )
    return;
  const node = authorElement(binding, id);
  if (!node) return;
  enterGroup(binding, `stroke:${id}`);
  binding.writing = true;
  try {
    binding.model.submit(
      [{ type: "remove_nodes", ids: flattenModel([node]).map(value => value.id) }],
      binding.origin
    );
  } finally {
    binding.writing = false;
    refresh(binding);
  }
}

export async function linkEntity(
  binding: CanvasBinding,
  id: string,
  kind: import("@tau/db-schema/content-identities").ContentEntityKind,
  localId: number
): Promise<boolean> {
  const board = assertWritable(binding),
    valid = board.captureSubmission(flatten(board.children).find(node => node.id === id));
  if (!canEditElement(binding, id) || !binding.options.referenceEntity)
    throw new Error("此元素不能建立外部引用");
  const before = JSON.stringify(authorElement(binding, id)?.entity);
  const entity = await binding.options.referenceEntity(kind, localId);
  if (
    !valid() ||
    !canEditElement(binding, id) ||
    JSON.stringify(authorElement(binding, id)?.entity) !== before
  )
    return false;
  binding.submit([{ type: "set_entity", id, entity }]);
  return true;
}

export function unlinkEntity(binding: CanvasBinding, id: string): void {
  if (!canEditElement(binding, id)) throw new Error("引用目标不可编辑");
  binding.submit([{ type: "set_entity", id, entity: null }]);
}

export function setPresentations(
  binding: CanvasBinding,
  before: readonly import("../types/presentation").PresentationSequence[],
  after: readonly import("../types/presentation").PresentationSequence[]
): void {
  binding.submit([{ type: "set_presentation", before, after }]);
}

export function compact(commands: readonly WhiteboardModelCommand[]): WhiteboardModelCommand[] {
  const result: WhiteboardModelCommand[] = [];
  const patches = new Map<string, Extract<WhiteboardModelCommand, { type: "set_node" }>>();
  for (const command of commands) {
    if (command.type !== "set_node") {
      result.push(command);
      patches.clear();
      continue;
    }
    const previous = patches.get(command.id);
    if (previous)
      previous.patch = {
        ...previous.patch,
        ...command.patch,
        ...(command.patch.style
          ? { style: { ...previous.patch.style, ...command.patch.style } }
          : {}),
      };
    else {
      const copy = { ...command };
      patches.set(command.id, copy);
      result.push(copy);
    }
  }
  return result;
}
