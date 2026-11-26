import type { createWhiteboardBinding } from "@tau/whiteboard/collaboration";

type Binding = ReturnType<typeof createWhiteboardBinding>;

function dragSurface(scope: ParentNode) {
  const stage = scope.querySelector<HTMLElement>("[data-whiteboard-stage]");
  if (!stage) throw new Error("缺少画布指针层");
  const style = stage.ownerDocument.createElement("style");
  style.textContent =
    "[data-whiteboard-stage][data-frame-drag]::after { content: ''; position: absolute; inset: 0; touch-action: none; cursor: move; }";
  stage.ownerDocument.head.append(style);
  return stage;
}

export function installDragProbe(binding: Binding, variant: string, scope: ParentNode = document) {
  const board = binding.board;
  if (!board) throw new Error("画框拖动夹具未挂载");
  const presentation = board.framePresentation;
  if (variant === "budget-scope") {
    const stats = {
      hitMode: "commit",
      history: { reused: 0, totalClocks: 0, checkedClocks: 0 },
      armed: 0,
      enabled: 0,
      triggerMs: [] as number[],
      batchMs: [] as number[],
    };
    const record = presentation.recordGeometryCost.bind(presentation);
    let owner: typeof board.interactions.activePointerState = null;
    let first = 0;
    presentation.recordGeometryCost = (ms, isolated) => {
      const gesture = board.interactions.activePointerState;
      if (gesture !== owner) {
        owner = gesture;
        first = performance.now() - ms;
        stats.armed++;
      }
      stats.batchMs.push(ms);
      const before = presentation.isGeometryLimited();
      record(ms, isolated);
      if (!before && presentation.isGeometryLimited()) {
        stats.enabled++;
        stats.triggerMs.push(performance.now() - first);
      }
    };
    return stats;
  }
  const adaptive = variant.startsWith("adaptive-");
  const history = variant.includes("history-")
    ? { reused: 0, totalClocks: 0, checkedClocks: 0 }
    : undefined;
  const stats = {
    hitMode: adaptive ? "frames" : "off",
    history,
    armed: 0,
    enabled: 0,
    triggerMs: [] as number[],
  };
  if (variant === "history-scope") return stats;
  if (adaptive) {
    const stage = dragSurface(scope);
    let raf = 0,
      started = 0,
      lastFrame = 0,
      lastInput = 0;
    const stalls: number[] = [];
    const tick = (now: number) => {
      if (
        now - started > 200 &&
        lastFrame &&
        now - lastFrame > 24 &&
        performance.now() - lastInput < 90
      ) {
        stalls.push(now);
        while (stalls.length && now - stalls[0] > 1800) stalls.shift();
        if (stalls.length >= 3) {
          stage.setAttribute("data-frame-drag", "");
          stats.enabled++;
          stats.triggerMs.push(now - started);
          raf = 0;
          return;
        }
      }
      lastFrame = now;
      raf = requestAnimationFrame(tick);
    };
    const move = presentation.move.bind(presentation);
    presentation.move = (x, y) => {
      move(x, y);
      if (!presentation.isMoving()) return;
      lastInput = performance.now();
      if (!started) {
        started = lastInput;
        stats.armed++;
        raf = requestAnimationFrame(tick);
      }
    };
    presentation.subscribe(() => {
      if (started && !presentation.isMoving()) {
        cancelAnimationFrame(raf);
        raf = started = lastFrame = 0;
        stalls.length = 0;
        stage.removeAttribute("data-frame-drag");
      }
    });
    return stats;
  }
  if (variant === "release-only") {
    // 因果对照故意移除中途发布，只用于量出定期结算的成本。
    const preview = binding.previewFramePosition.bind(binding);
    binding.previewFramePosition = (...args) => {
      const frame = preview(...args);
      clearTimeout(binding.gestureTimer);
      binding.gestureTimer = undefined;
      binding.gestureWindowStart = undefined;
      return frame;
    };
    return;
  }
  if (variant === "label" || variant === "scope" || variant === "control-scope") return;
  if (!["surface", "surface-label", "surface-scope"].includes(variant))
    throw new Error("未知画框拖动原型");
  const stage = dragSurface(scope);
  const move = presentation.move.bind(presentation);
  presentation.move = (x, y) => {
    if (!stage.hasAttribute("data-frame-drag")) stage.setAttribute("data-frame-drag", "");
    move(x, y);
  };
  presentation.subscribe(() => {
    if (!presentation.isMoving()) stage.removeAttribute("data-frame-drag");
  });
}
