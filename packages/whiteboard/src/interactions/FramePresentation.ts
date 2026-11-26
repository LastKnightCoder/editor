import { BoardUtil } from "../utils/BoardUtil";
import { projectArrow, projectArrowTree } from "../utils/ArrowProjection";
import type Board from "../Board";
import type { BoardElement } from "../types/element";
import { CULL_CELL_PX } from "../utils/ViewportUtil";

type Snapshot = Required<import("../extensions/api").WhiteboardSnapshot>;
const REBASE_SELECTION: Snapshot["selection"] = { selectedElements: [], selectArea: null };
interface Root {
  element: BoardElement;
  group: SVGGElement;
}
interface Motion {
  slowBatches: number;
  inputSurface?: HTMLElement;
  id: string;
  base: BoardElement;
  dx: number;
  dy: number;
  targetX: number;
  targetY: number;
  logicalX: number;
  logicalY: number;
  ids: Set<string>;
  tileX: number;
  tileY: number;
}

/** 仅复用活动画框的绘制坐标；模型、命中及持久化始终使用实际坐标。 */
export class FramePresentation {
  private roots = new Map<string, Root>();
  private paintGroups = new Map<string, Set<SVGGElement>>();
  private motion?: Motion;
  private visual?: Snapshot;
  private pendingRoot?: string;
  private rebasing = false;
  private holdRebase = false;
  private rebaseFrame?: number;
  private selectionFrame?: number;
  private pendingFlush?: () => void;
  private flushing = false;
  private notifying = 0;
  private queried?: { source: Snapshot; value: Snapshot; x: number; y: number };
  private listeners = new Set<() => void>();
  private arrows = new Map<string, BoardElement>();
  private arrowListeners = new Map<string, Set<() => void>>();
  constructor(private readonly board: Board) {}

  readonly isNotifying = () => this.notifying > 0;
  private notify = (listener: () => void) => {
    this.notifying++;
    try {
      const result: unknown = listener();
      if (result instanceof Promise)
        void result.catch(error => console.error("画框显示订阅失败", error));
    } catch (error) {
      console.error("画框显示订阅失败", error);
    } finally {
      this.notifying--;
    }
  };

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  readonly isRebasing = () => this.rebasing;
  readonly rebasePhase = () => (this.rebasing ? (this.holdRebase ? 1 : 2) : 0);
  readonly isMoving = () => !!this.motion;
  isGeometryLimited() {
    return !!this.motion?.inputSurface;
  }

  recordGeometryCost(ms: number, isolated: boolean) {
    const motion = this.motion;
    if (!motion || motion.inputSurface) return;
    // 给输入与绘制保留四分之一帧；连续两笔几何提交超过余量才切换命中面。
    motion.slowBatches = isolated && ms > (1000 / 60) * 0.75 ? motion.slowBatches + 1 : 0;
    if (motion.slowBatches < 2) return;
    const surface = this.roots
      .get(motion.id)
      ?.group.closest<HTMLElement>("[data-whiteboard-stage]");
    if (surface) {
      motion.inputSurface = surface;
      surface.setAttribute("data-frame-drag", "");
    }
  }

  private setRebasing(value: boolean) {
    if (this.rebasing === value) return;
    this.rebasing = value;
    this.listeners.forEach(this.notify);
  }

  private cancelRebaseFrame() {
    if (this.rebaseFrame !== undefined) cancelAnimationFrame(this.rebaseFrame);
    if (this.selectionFrame !== undefined) cancelAnimationFrame(this.selectionFrame);
    this.rebaseFrame = undefined;
    this.selectionFrame = undefined;
    this.holdRebase = false;
  }

  register(element: BoardElement, group: SVGGElement) {
    const entry = { element, group };
    this.roots.set(element.id, entry);
    group.style.willChange = "transform";
    if (!this.motion && this.pendingRoot !== element.id) this.transform(element.id, 0, 0);
    if (this.motion?.id === element.id) this.paint(this.motion);
    return () => {
      if (this.roots.get(element.id) === entry) this.roots.delete(element.id);
      if (!this.motion && this.pendingRoot === element.id) {
        this.cancelRebaseFrame();
        this.pendingRoot = undefined;
        this.visual = undefined;
        this.arrows.clear();
        this.setRebasing(false);
      }
    };
  }

  registerPaintGroup(id: string, group: SVGGElement) {
    const groups = this.paintGroups.get(id) ?? new Set<SVGGElement>();
    groups.add(group);
    this.paintGroups.set(id, groups);
    group.style.willChange = "transform";
    group.style.transform = this.roots.get(id)?.group.style.transform || "translate3d(0px, 0px, 0)";
    return () => {
      groups.delete(group);
      if (!groups.size && this.paintGroups.get(id) === groups) this.paintGroups.delete(id);
    };
  }

  hasRoot(id: string) {
    return this.roots.has(id);
  }

  private transform(id: string, dx: number, dy: number) {
    const transform = `translate3d(${dx}px, ${dy}px, 0)`;
    const root = this.roots.get(id);
    if (root) root.group.style.transform = transform;
    for (const group of this.paintGroups.get(id) ?? []) group.style.transform = transform;
  }

  rendered(element: BoardElement) {
    const root = this.roots.get(element.id);
    if (!root) return;
    root.element = element;
    if (this.motion?.id === element.id) {
      const current = this.board.children.find(node => node.id === element.id);
      this.motion.base = element;
      if (current) {
        this.motion.dx = this.motion.targetX - element.x;
        this.motion.dy = this.motion.targetY - element.y;
      }
      if (this.visual)
        this.visual = {
          ...this.visual,
          children: this.visual.children.map(node => (node.id === element.id ? element : node)),
        };
      this.paint(this.motion);
    } else if (this.pendingRoot === element.id) {
      const current = this.board.children.find(node => node.id === element.id);
      if (
        current &&
        (current.x !== element.x ||
          current.y !== element.y ||
          current.width !== element.width ||
          current.height !== element.height)
      )
        return;
      this.transform(element.id, 0, 0);
      root.group.style.willChange = "transform";
      this.pendingRoot = undefined;
      this.cancelRebaseFrame();
      this.arrows.clear();
      // 坐标落地后的下一帧再显示编辑控件，避免与批量属性更新挤在同一帧。
      if (this.rebasing && typeof requestAnimationFrame === "function") {
        this.selectionFrame = requestAnimationFrame(() => {
          this.selectionFrame = undefined;
          this.visual = undefined;
          this.setRebasing(false);
          this.board.emit("change", { source: "projection" });
        });
      } else {
        this.visual = undefined;
        this.setRebasing(false);
      }
    }
  }

  begin(element: BoardElement) {
    if (!this.board.document?.previewFramePosition || this.motion || !this.roots.has(element.id))
      return;
    const root = this.roots.get(element.id);
    if (!root) return;
    this.cancelRebaseFrame();
    if (!this.visual) this.visual = this.board.getCanvasSnapshot();
    const ids = new Set<string>();
    const visit = (node: BoardElement) => {
      ids.add(node.id);
      node.children?.forEach(visit);
    };
    visit(element);
    this.motion = {
      id: element.id,
      base: root.element,
      dx: element.x - root.element.x,
      dy: element.y - root.element.y,
      targetX: element.x,
      targetY: element.y,
      logicalX: element.x,
      logicalY: element.y,
      ids,
      slowBatches: 0,
      inputSurface: undefined,
      tileX: 0,
      tileY: 0,
    };
    this.pendingRoot = undefined;
    this.setRebasing(false);
    this.paint(this.motion);
    this.listeners.forEach(this.notify);
  }

  private paint(motion: Motion) {
    const root = this.roots.get(motion.id);
    if (!root) return;
    root.group.style.willChange = "transform";
    this.transform(motion.id, motion.dx, motion.dy);
  }

  publish(snapshot: Snapshot) {
    const motion = this.motion;
    if (!motion || !this.visual) return;
    const current = snapshot.children.find(node => node.id === motion.id);
    if (!current) {
      this.end();
      return;
    }
    motion.logicalX = current.x;
    motion.logicalY = current.y;
    this.queried = undefined;
    this.arrows.clear();
    this.paint(motion);
    for (const arrow of snapshot.children) {
      if (arrow.type === "arrow" && this.arrows.get(arrow.id) !== arrow) {
        const visual = this.projectArrow(arrow);
        this.arrows.set(arrow.id, visual);
        this.arrowListeners.get(arrow.id)?.forEach(this.notify);
      }
    }
  }

  move(x: number, y: number) {
    const motion = this.motion;
    if (!motion || !this.visual) return;
    if (motion.targetX !== x || motion.targetY !== y) this.board.advancePresentationVersion();
    motion.targetX = x;
    motion.targetY = y;
    this.queried = undefined;
    this.arrows.clear();
    motion.dx = x - motion.base.x;
    motion.dy = y - motion.base.y;
    this.paint(motion);
    for (const [id, listeners] of this.arrowListeners) {
      const node = BoardUtil.getElementById(this.board, id);
      if (node) {
        this.arrows.set(id, this.projectArrow(node));
        listeners.forEach(this.notify);
      }
    }
    this.listeners.forEach(this.notify);
    const step = (CULL_CELL_PX * 0.75) / this.board.viewPort.zoom;
    const tileX = Math.trunc(motion.dx / step),
      tileY = Math.trunc(motion.dy / step);
    if (tileX !== motion.tileX || tileY !== motion.tileY) {
      motion.tileX = tileX;
      motion.tileY = tileY;
      this.visual = { ...this.visual, children: [...this.visual.children] };
      this.board.emit("change", { source: "projection" });
    }
  }

  private translated(element: BoardElement): BoardElement {
    const motion = this.motion;
    if (!motion || !motion.ids.has(element.id)) return element;
    const dx = motion.targetX - motion.logicalX,
      dy = motion.targetY - motion.logicalY;
    if (!dx && !dy) return element;
    const move = (node: BoardElement): BoardElement => ({
      ...node,
      x: node.x + dx,
      y: node.y + dy,
      ...(node.children ? { children: node.children.map(move) } : {}),
    });
    return move(element);
  }
  private eligibleArrow = (node: BoardElement) =>
    node.type === "arrow" && !this.board.extensions?.unknownElementReason(node);
  private projectArrow(node: BoardElement) {
    return this.eligibleArrow(node)
      ? projectArrow(this.board, node, id => {
          const target = BoardUtil.getElementById(this.board, id);
          return target ? this.translated(target) : undefined;
        })
      : node;
  }
  queryElement(element: BoardElement) {
    if (!this.motion) return element;
    return element.type === "arrow" ? this.projectArrow(element) : this.translated(element);
  }
  querySnapshot(source: Snapshot): Snapshot {
    const motion = this.motion;
    if (!motion) return source;
    if (
      this.queried?.source === source &&
      this.queried.x === motion.targetX &&
      this.queried.y === motion.targetY
    )
      return this.queried.value;
    const children = projectArrowTree(
      this.board,
      source.children.map(node => this.translated(node)),
      this.eligibleArrow
    );
    const byId = new Map<string, BoardElement>();
    const visit = (nodes: BoardElement[]) => {
      for (const node of nodes) {
        byId.set(node.id, node);
        if (node.children?.length) visit(node.children);
      }
    };
    visit(children);
    const value = {
      ...source,
      children,
      selection: {
        ...source.selection,
        selectedElements: source.selection.selectedElements.map(node => byId.get(node.id) ?? node),
      },
    };
    this.queried = { source, value, x: motion.targetX, y: motion.targetY };
    return value;
  }

  setFlush(callback?: () => void) {
    this.pendingFlush = callback;
  }
  flush() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      this.pendingFlush?.();
      this.board.document?.flushFramePosition?.();
    } finally {
      this.flushing = false;
    }
  }

  snapshot(current: Snapshot): Snapshot {
    if (this.pendingRoot && !current.children.some(node => node.id === this.pendingRoot))
      return current;
    if ((!this.motion && !this.holdRebase && !this.rebasing) || !this.visual) return current;
    const children = this.motion || this.holdRebase ? this.visual.children : current.children;
    const selection = this.rebasing ? REBASE_SELECTION : current.selection;
    if (
      this.visual.children !== children ||
      this.visual.selection !== selection ||
      this.visual.viewPort !== current.viewPort ||
      this.visual.sketch !== current.sketch ||
      this.visual.presentationSequences !== current.presentationSequences
    )
      this.visual = { ...current, children, selection };
    return this.visual;
  }

  offset(element: BoardElement) {
    if (this.motion?.id !== element.id || element !== this.motion.base) return undefined;
    return { x: this.motion.dx, y: this.motion.dy };
  }

  end() {
    if (!this.motion) return;
    this.motion.inputSurface?.removeAttribute("data-frame-drag");
    const id = this.motion.id;
    const root = this.roots.get(id),
      current = this.board.children.find(node => node.id === id);
    this.motion = undefined;
    if (root && root.element === current) {
      this.transform(id, 0, 0);
      root.group.style.willChange = "transform";
      this.pendingRoot = undefined;
      this.visual = undefined;
      this.arrows.clear();
      this.setRebasing(false);
      this.listeners.forEach(this.notify);
      return;
    }
    this.pendingRoot = id;
    if (this.roots.has(id) && typeof requestAnimationFrame === "function") {
      // 屏幕已在终点，先让最终模型事务落地，再归位子树，避免两段重活挤在同一帧。
      this.holdRebase = true;
      this.rebaseFrame = requestAnimationFrame(() => {
        this.rebaseFrame = requestAnimationFrame(() => {
          this.rebaseFrame = undefined;
          this.holdRebase = false;
          this.listeners.forEach(this.notify);
          this.board.emit("change", { source: "projection" });
        });
      });
    }
    this.setRebasing(this.roots.has(id));
    if (!this.roots.has(id)) {
      this.visual = undefined;
      this.pendingRoot = undefined;
    }
    this.listeners.forEach(this.notify);
    this.board.emit("change", { source: "projection" });
  }

  finishForInteraction() {
    this.cancelRebaseFrame();
    if (!this.motion) this.visual = undefined;
    this.setRebasing(false);
    this.board.emit("change", { source: "projection" });
  }

  subscribeArrow(id: string, listener: () => void) {
    const listeners = this.arrowListeners.get(id) ?? new Set<() => void>();
    listeners.add(listener);
    this.arrowListeners.set(id, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.arrowListeners.delete(id);
    };
  }
  arrow(element: BoardElement) {
    if (this.motion) {
      const cached = this.arrows.get(element.id);
      if (cached) return cached;
      const value = this.projectArrow(element);
      this.arrows.set(element.id, value);
      return value;
    }
    return this.pendingRoot ? (this.arrows.get(element.id) ?? element) : element;
  }

  destroy() {
    this.motion?.inputSurface?.removeAttribute("data-frame-drag");
    this.cancelRebaseFrame();
    for (const root of this.roots.values()) {
      root.group.style.transform = "";
      root.group.style.willChange = "";
    }
    for (const groups of this.paintGroups.values())
      for (const group of groups) {
        group.style.transform = "";
        group.style.willChange = "";
      }
    this.paintGroups.clear();
    this.pendingFlush = undefined;
    this.queried = undefined;
    this.motion = undefined;
    this.visual = undefined;
    this.pendingRoot = undefined;
    this.roots.clear();
    this.listeners.clear();
    this.arrowListeners.clear();
    this.arrows.clear();
  }
}
