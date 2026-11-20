import type { BoardElement } from "../types/element";
import { refresh } from "./projection";
import { compact } from "./commands";
import type { CanvasBinding } from "./binding";

export function beginGesture(binding: CanvasBinding, options?: { realtime?: boolean }): void {
  if (binding.gesture || binding.closed) return;
  binding.splitHistory();
  binding.pendingFeedback = [];
  binding.gesture = true;
  binding.gestureCaptureTimeout = binding.history.captureTimeout;
  binding.history.captureTimeout = Number.POSITIVE_INFINITY;
  if (options?.realtime) {
    // 独立捕获整次拖动，结束后移交一个撤销项；取消不破坏已有撤销/重做栈。
    binding.gestureHistory = binding.model.createUndoManager({
      trackedOrigins: new Set(),
      captureTimeout: Number.POSITIVE_INFINITY,
      beforeChange: (history, direction) => binding.model.preflightHistory(history, direction),
    });
  }
  binding.pending = [];
}

export function isRealtimeGesture(binding: CanvasBinding): boolean {
  return !!binding.gestureHistory;
}

export function scheduleGesture(binding: CanvasBinding): void {
  if (!binding.gestureHistory || binding.gestureTimer !== undefined) return;
  binding.gestureTimer = setTimeout(() => {
    binding.gestureTimer = undefined;
    if (binding.isBlocked()) {
      binding.endGesture(false);
      return;
    }
    try {
      flushGesture(binding);
    } catch (error) {
      binding.board?.interactions.cancel();
      binding.endGesture(false);
      console.error("白板拖动增量提交失败", error);
    }
  }, 50);
}

export function flushGesture(binding: CanvasBinding): void {
  if (!binding.gestureHistory || !binding.pending.length) return;
  const commands = compact(binding.pending);
  binding.streamingGesture = true;
  try {
    binding.submit(commands);
    binding.pending = [];
  } finally {
    binding.streamingGesture = false;
  }
}

export function endGesture(binding: CanvasBinding, commit: boolean): void {
  if (!binding.gesture) return;
  clearTimeout(binding.gestureTimer);
  binding.gestureTimer = undefined;
  if (commit && binding.gestureHistory) {
    try {
      flushGesture(binding);
    } catch (error) {
      binding.endGesture(false);
      throw error;
    }
  }
  const pending = compact(binding.pending),
    feedback = binding.pendingFeedback,
    history = binding.gestureHistory;
  binding.pendingFeedback = [];
  binding.gesture = false;
  binding.gestureHistory = undefined;
  binding.pending = [];
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
    } else if (commit && pending.length) binding.submit(pending);
    if (commit) applyFeedback(binding, feedback);
  } finally {
    history?.destroy();
    binding.history.captureTimeout = binding.gestureCaptureTimeout ?? 500;
    binding.gestureCaptureTimeout = undefined;
    binding.splitHistory();
    refresh(binding);
  }
}

export function captureFeedback(
  binding: CanvasBinding,
  node: BoardElement,
  patch: Record<string, unknown>
) {
  const codec = binding.options.types[node.type];
  if (!codec || (node.contractId && codec.contractId !== node.contractId)) return [];
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
