import { matchesCanvasContract } from "./types";
import type { BoardElement } from "../types/element";
import { authorElement, canvasElement, refresh } from "./projection";
import { compact } from "./commands";
import { assertWritable } from "./element-access";
import type { WhiteboardModelCommand } from "@tau/collaboration";
import type { CanvasBinding } from "./binding";

export function beginGesture(binding: CanvasBinding, options?: { realtime?: boolean }): void {
  if (binding.gesture || binding.closed) return;
  binding.splitHistory();
  binding.pendingFeedback = [];
  binding.lastCommittedChildren = undefined;
  binding.gesture = true;
  binding.gestureCaptureTimeout = binding.history.captureTimeout;
  binding.history.captureTimeout = Number.POSITIVE_INFINITY;
  binding.coalescingGesture =
    !!options?.realtime && binding.options.coalesceLocalGesture?.() === true;
  if (options?.realtime && !binding.coalescingGesture) startGestureHistory(binding);
  binding.pending = [];
  binding.framePending = undefined;
}

// 只有实际发布中间位置时才需要单独的撤销栈，短途本机拖动直接提交一个撤销项。
export function prepareGestureHistory(binding: CanvasBinding) {
  return binding.model.createUndoManager({
    trackedOrigins: new Set(),
    captureTimeout: Number.POSITIVE_INFINITY,
    beforeChange: (history, direction) => binding.model.preflightHistory(history, direction),
  });
}

function startGestureHistory(binding: CanvasBinding) {
  binding.gestureHistory = binding.idleGestureHistory ?? prepareGestureHistory(binding);
  binding.idleGestureHistory = undefined;
  binding.gestureHistory.stopCapturing();
}

export function isRealtimeGesture(binding: CanvasBinding): boolean {
  return !!binding.gestureHistory || binding.coalescingGesture;
}

export function scheduleGesture(binding: CanvasBinding): void {
  if (!isRealtimeGesture(binding)) return;
  const local = binding.coalescingGesture;
  if (!local && binding.gestureTimer !== undefined) return;
  const now = performance.now();
  binding.gestureWindowStart ??= now;
  if (binding.gestureTimer !== undefined && now - binding.gestureWindowStart >= 500) return;
  // 本机连续移动优先合并，长拖仍定期同步到其他窗口；共享手势沿用实时发送间隔。
  const delay = local ? Math.max(0, Math.min(150, 500 - (now - binding.gestureWindowStart))) : 50;
  clearTimeout(binding.gestureTimer);
  binding.gestureTimer = setTimeout(() => {
    binding.gestureTimer = undefined;
    binding.gestureWindowStart = undefined;
    if (binding.isBlocked()) {
      binding.endGesture(false);
      return;
    }
    try {
      if (!binding.gestureHistory && binding.pending.length) startGestureHistory(binding);
      flushGesture(binding);
    } catch (error) {
      binding.board?.interactions.cancel();
      binding.endGesture(false);
      console.error("白板拖动增量提交失败", error);
    }
  }, delay);
}

function commitPreview(binding: CanvasBinding, commands: WhiteboardModelCommand[], local: boolean) {
  const command = commands[0];
  const geometry = command?.type === "set_node" ? command.patch.geometry : undefined;
  if (
    local &&
    commands.length === 1 &&
    command.type === "set_node" &&
    geometry &&
    Object.keys(command.patch).length === 1
  ) {
    const board = assertWritable(binding, false);
    const card = board.children.find(node => node.id === command.id);
    if (
      card?.type === "document" &&
      !card.children?.length &&
      card.x === geometry.x &&
      card.y === geometry.y &&
      card.width === geometry.width &&
      card.height === geometry.height &&
      (card.rotation ?? 0) === geometry.rotation
    ) {
      const before = binding.readSnapshot();
      binding.writing = true;
      let committed;
      try {
        committed = binding.model.tryLocalTranslation(
          card.id,
          geometry,
          binding.gestureHistory ?? binding.origin
        );
      } finally {
        binding.writing = false;
      }
      if (committed) {
        // 末帧已计算所有连线位置；有观察者附加写入时必须重新读取权威投影。
        if (committed.isolated) {
          binding.publishGeometries(before, [{ id: card.id, geometry }]);
          board.publishDocument(board.children);
          binding.lastCommittedChildren = board.children;
        } else refresh(binding);
        return;
      }
    }
  }
  const board = assertWritable(binding, false);
  const geometries = commands.flatMap(command => {
    if (
      command.type !== "set_node" ||
      Object.keys(command.patch).length !== 1 ||
      !command.patch.geometry
    )
      return [];
    const node = canvasElement(board.children, command.id),
      value = command.patch.geometry;
    if (!node) return [];
    const previous = authorElement(binding, command.id)?.geometry;
    if (
      (["x", "y", "width", "height", "rotation"] as const).some(
        key =>
          (node[key] ?? (key === "rotation" ? 0 : undefined)) !== value[key] &&
          previous?.[key] !== value[key]
      )
    )
      return [];
    return [{ id: command.id, geometry: value }];
  });
  if (geometries.length === commands.length && geometries.length) {
    const before = binding.readSnapshot();
    binding.writing = true;
    let committed;
    try {
      committed = binding.model.tryLocalGeometries(
        geometries,
        binding.gestureHistory ?? binding.origin
      );
    } finally {
      binding.writing = false;
    }
    if (committed) {
      if (committed.isolated) {
        binding.publishGeometries(before, geometries);
        board.publishDocument(board.children);
        binding.lastCommittedChildren = board.children;
      } else refresh(binding);
      return;
    }
  }
  binding.submit(commands);
}

export function flushGesture(binding: CanvasBinding): void {
  if (!binding.gestureHistory || !binding.pending.length) return;
  const commands =
    binding.framePending?.commands === binding.pending ? binding.pending : compact(binding.pending);
  binding.streamingGesture = true;
  try {
    commitPreview(binding, commands, binding.coalescingGesture);
    binding.pending = [];
  } finally {
    binding.streamingGesture = false;
  }
}

export function endGesture(binding: CanvasBinding, commit: boolean): void {
  if (!binding.gesture) return;
  clearTimeout(binding.gestureTimer);
  binding.gestureTimer = undefined;
  binding.gestureWindowStart = undefined;
  if (commit && binding.gestureHistory) {
    try {
      flushGesture(binding);
    } catch (error) {
      binding.endGesture(false);
      throw error;
    }
  }
  const pending =
      binding.framePending?.commands === binding.pending
        ? binding.pending
        : compact(binding.pending),
    feedback = binding.pendingFeedback,
    history = binding.gestureHistory,
    local = binding.coalescingGesture;
  binding.pendingFeedback = [];
  binding.gesture = false;
  binding.coalescingGesture = false;
  binding.gestureHistory = undefined;
  binding.pending = [];
  let projected = false;
  try {
    if (history && !binding.model.doc.isDestroyed) {
      if (commit || binding.options.canWrite?.() === false) {
        if (history.undoStack.length) {
          binding.history.clear(false, true);
          binding.history.undoStack.push(...history.undoStack);
          history.undoStack = [];
        }
      } else if (history.undoStack.length) {
        binding.writing = true;
        try {
          history.undo();
          history.clear();
        } finally {
          binding.writing = false;
        }
      }
    } else if (commit && pending.length) {
      commitPreview(binding, pending, local);
      projected = true;
    }
    if (commit) applyFeedback(binding, feedback);
  } finally {
    if (history) {
      history.clear();
      history.stopCapturing();
      if (!binding.closed) binding.idleGestureHistory = history;
      else history.destroy();
    }
    binding.framePending = undefined;
    binding.history.captureTimeout = binding.gestureCaptureTimeout ?? 500;
    binding.gestureCaptureTimeout = undefined;
    binding.splitHistory();
    if (
      (!projected && binding.lastCommittedChildren !== binding.board?.children) ||
      feedback.length
    )
      refresh(binding);
    binding.lastCommittedChildren = undefined;
  }
}

export function captureFeedback(
  binding: CanvasBinding,
  node: BoardElement,
  patch: Record<string, unknown>
) {
  const codec = binding.options.types[node.type];
  if (!codec || (node.contractId && !matchesCanvasContract(codec, node.contractId))) return [];
  const local = Object.fromEntries(
    Object.entries(patch).filter(([key]) => codec.transientProperties?.includes(key))
  );
  return Object.keys(local).length ? [{ id: node.id, patch: local }] : [];
}

export function applyFeedback(
  binding: CanvasBinding,
  values: readonly { id: string; patch: Record<string, unknown> }[]
) {
  for (const { id, patch } of values)
    binding.feedback.set(id, { ...binding.feedback.get(id), ...patch });
}
