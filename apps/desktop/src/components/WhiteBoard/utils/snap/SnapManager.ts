import type Board from "../../Board";
import type { BoardElement, ViewPort } from "../../types";
import { EHandlerPosition } from "../../types/resize";
import { BoardUtil } from "../BoardUtil";
import ViewportUtil from "../ViewportUtil";
import {
  SnapAxis,
  SnapBounds,
  SnapGuide,
  SnapResizeEdges,
  hasSnapBounds,
  snapMove,
  snapMoveToGrid,
  snapResize,
  snapResizeToGrid,
} from "./SnapGeometry";

/** 吸附阈值（屏幕像素），按 zoom 换算到画布单位 */
export const SNAP_THRESHOLD_PX = 8;

const EMPTY_GUIDES: SnapGuide[] = [];

const RESIZE_EDGES: Record<EHandlerPosition, SnapResizeEdges> = {
  [EHandlerPosition.TopLeft]: { x: "min", y: "min" },
  [EHandlerPosition.TopRight]: { x: "max", y: "min" },
  [EHandlerPosition.BottomLeft]: { x: "min", y: "max" },
  [EHandlerPosition.BottomRight]: { x: "max", y: "max" },
  [EHandlerPosition.Left]: { x: "min" },
  [EHandlerPosition.Right]: { x: "max" },
  [EHandlerPosition.Top]: { y: "min" },
  [EHandlerPosition.Bottom]: { y: "max" },
};

const TOP_HANDLES = new Set([EHandlerPosition.TopLeft, EHandlerPosition.TopRight]);

const collectSubtreeIds = (element: BoardElement, ids: Set<string>) => {
  ids.add(element.id);
  element.children?.forEach(child => collectSubtreeIds(child, ids));
};

export interface SnapMoveOptions {
  /** 正在移动的元素，自身及子孙不作为候选 */
  elements: BoardElement[];
  /** 参与吸附的运动包围盒（通常是选区并集） */
  bounds: SnapBounds;
  enabled: boolean;
}

export interface SnapResizeOptions {
  element: BoardElement;
  bounds: SnapBounds;
  position: EHandlerPosition;
  enabled: boolean;
  /** 等比缩放时只吸附主轴，另一维按比例回算 */
  preserveRatio?: boolean;
  /** 限定可吸附的轴（如固定高度元素只允许 x） */
  axes?: SnapAxis[];
}

/**
 * 吸附会话：拖拽/缩放开始时惰性拍候选快照，期间每帧计算吸附与参考线，
 * 结束时统一清空。任何指针抬起/取消或窗口失焦都会兜底结束，避免参考线残留。
 */
export class SnapManager {
  private guides: SnapGuide[] = EMPTY_GUIDES;
  private listeners = new Set<() => void>();
  private gridSize: number | null = null;
  private candidateCache: {
    excludeKey: string;
    viewPort: ViewPort;
    candidates: SnapBounds[];
  } | null = null;
  private sessionActive = false;
  private endTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private board: Board) {}

  getGuides = (): SnapGuide[] => this.guides;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** 网格可见时传入网格尺寸，吸附改为对网格取整且不画参考线 */
  setGridSize(gridSize: number | null) {
    this.gridSize = gridSize && gridSize > 0 ? gridSize : null;
  }

  move({ elements, bounds, enabled }: SnapMoveOptions): { dx: number; dy: number } {
    this.beginSession();
    if (!enabled) {
      this.setGuides(EMPTY_GUIDES);
      return { dx: 0, dy: 0 };
    }
    if (this.gridSize) {
      this.setGuides(EMPTY_GUIDES);
      return snapMoveToGrid(bounds, this.gridSize);
    }
    const { dx, dy, guides } = snapMove(bounds, this.getCandidates(elements), this.threshold);
    this.setGuides(guides);
    return { dx, dy };
  }

  resize({
    element,
    bounds,
    position,
    enabled,
    preserveRatio = false,
    axes,
  }: SnapResizeOptions): SnapBounds {
    this.beginSession();
    if (!enabled) {
      this.setGuides(EMPTY_GUIDES);
      return bounds;
    }

    const allowed = (axis: SnapAxis) => !axes || axes.includes(axis);
    const handleEdges = RESIZE_EDGES[position];
    // 等比缩放时两轴独立吸附会破坏比例，只保留主轴
    const primary: SnapAxis =
      position === EHandlerPosition.Top || position === EHandlerPosition.Bottom ? "y" : "x";
    const edges: SnapResizeEdges = {};
    for (const axis of ["x", "y"] as const) {
      if (!handleEdges[axis] || !allowed(axis)) continue;
      if (preserveRatio && axis !== primary) continue;
      edges[axis] = handleEdges[axis];
    }

    let snapped: SnapBounds;
    if (this.gridSize) {
      snapped = snapResizeToGrid(bounds, edges, this.gridSize);
      this.setGuides(EMPTY_GUIDES);
    } else {
      const result = snapResize(bounds, edges, this.getCandidates([element]), this.threshold);
      snapped = result.bounds;
      this.setGuides(result.guides);
    }

    if (!preserveRatio || bounds.width <= 0 || bounds.height <= 0) return snapped;
    const ratio = bounds.width / bounds.height;
    if (primary === "x") {
      const height = snapped.width / ratio;
      const y = TOP_HANDLES.has(position) ? bounds.y + bounds.height - height : snapped.y;
      return { ...snapped, y, height };
    }
    return { ...snapped, width: snapped.height * ratio };
  }

  /** 结束吸附会话：清空参考线与候选快照 */
  end = () => {
    this.cancelScheduledEnd();
    this.candidateCache = null;
    this.setGuides(EMPTY_GUIDES);
    if (!this.sessionActive) return;
    this.sessionActive = false;
    window.removeEventListener("pointerup", this.scheduleEnd, true);
    window.removeEventListener("pointercancel", this.scheduleEnd, true);
    window.removeEventListener("blur", this.end);
  };

  dispose() {
    this.end();
    this.listeners.clear();
  }

  private get threshold() {
    return SNAP_THRESHOLD_PX / this.board.viewPort.zoom;
  }

  private beginSession() {
    if (this.sessionActive) return;
    this.sessionActive = true;
    // 捕获阶段登记、下一轮任务再清，确保排在拖拽/缩放自身的 pointerup 处理之后，
    // 且不受中途 stopPropagation 影响
    window.addEventListener("pointerup", this.scheduleEnd, true);
    window.addEventListener("pointercancel", this.scheduleEnd, true);
    window.addEventListener("blur", this.end);
  }

  private scheduleEnd = () => {
    this.cancelScheduledEnd();
    this.endTimer = setTimeout(this.end, 0);
  };

  private cancelScheduledEnd() {
    if (this.endTimer === null) return;
    clearTimeout(this.endTimer);
    this.endTimer = null;
  }

  private setGuides(guides: SnapGuide[]) {
    if (guides === this.guides) return;
    if (guides.length === 0 && this.guides.length === 0) return;
    this.guides = guides.length === 0 ? EMPTY_GUIDES : guides;
    this.listeners.forEach(listener => listener());
  }

  /** 候选 = 视口内参与参考线的元素，排除运动元素及其子孙；视口不变时复用快照 */
  private getCandidates(movingElements: BoardElement[]): SnapBounds[] {
    const excluded = new Set<string>();
    movingElements.forEach(element => collectSubtreeIds(element, excluded));
    const excludeKey = [...excluded].sort().join("|");
    const { viewPort, capabilityService } = this.board;

    const cache = this.candidateCache;
    if (cache && cache.excludeKey === excludeKey && cache.viewPort === viewPort) {
      return cache.candidates;
    }

    const candidates: SnapBounds[] = [];
    BoardUtil.dfs(this.board, element => {
      if (BoardUtil.isBoard(element) || excluded.has(element.id)) return;
      if (!hasSnapBounds(element)) return;
      if (!capabilityService.shouldParticipateInRefLines(element)) return;
      if (!ViewportUtil.isRectInViewport(element, viewPort, 0)) return;
      candidates.push({
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
      });
    });

    this.candidateCache = { excludeKey, viewPort, candidates };
    return candidates;
  }
}

export default SnapManager;
