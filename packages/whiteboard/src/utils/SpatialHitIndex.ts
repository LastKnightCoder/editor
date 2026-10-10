import RBush from "rbush";
import Board from "../Board";
import { BoardElement } from "../types";

/**
 * 参与命中 / 框选的子元素：由元素的 render 能力过滤（折叠隐藏的子元素不参与）
 */
export const getHitTestChildren = (
  board: Board,
  element: BoardElement
): BoardElement[] | undefined => {
  const { children } = element;
  if (!children || children.length === 0) return children;
  return board.capabilityService?.getVisibleChildren(element, children) ?? children;
};

type SpatialBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type SpatialIndexItem = SpatialBounds & {
  id: string;
  order: number;
  element: BoardElement;
};

type FallbackItem = {
  id: string;
  order: number;
  element: BoardElement;
};

const BOUNDS_PADDING = 12;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const expandBounds = (bounds: SpatialBounds, padding: number): SpatialBounds => {
  return {
    minX: bounds.minX - padding,
    minY: bounds.minY - padding,
    maxX: bounds.maxX + padding,
    maxY: bounds.maxY + padding,
  };
};

export class SpatialHitIndex {
  private tree = new RBush<SpatialIndexItem>();
  private fallbackItems: FallbackItem[] = [];

  constructor(board: Board) {
    this.rebuild(board);
  }

  rebuild(board: Board): void {
    this.tree.clear();
    this.fallbackItems = [];

    const entries: SpatialIndexItem[] = [];
    let order = 0;

    this.traverseElements(board, board.children, element => {
      const currentOrder = order++;
      const bounds = this.resolveElementBounds(board, element);
      if (!bounds) {
        this.fallbackItems.push({
          id: element.id,
          order: currentOrder,
          element,
        });
        return;
      }

      entries.push({
        ...expandBounds(bounds, BOUNDS_PADDING),
        id: element.id,
        order: currentOrder,
        element,
      });
    });

    if (entries.length > 0) {
      this.tree.load(entries);
    }
  }

  queryPoint(x: number, y: number): BoardElement[] {
    const candidates = this.tree.search({
      minX: x,
      minY: y,
      maxX: x,
      maxY: y,
    });
    return this.mergeCandidates(candidates);
  }

  queryRect(minX: number, minY: number, maxX: number, maxY: number): BoardElement[] {
    const candidates = this.tree.search({ minX, minY, maxX, maxY });
    return this.mergeCandidates(candidates);
  }

  private mergeCandidates(candidates: SpatialIndexItem[]): BoardElement[] {
    const merged: Array<{
      id: string;
      order: number;
      element: BoardElement;
    }> = [
      ...candidates.map(({ id, order, element }) => ({ id, order, element })),
      ...this.fallbackItems,
    ];

    merged.sort((a, b) => a.order - b.order);

    const seen = new Set<string>();
    const orderedElements: BoardElement[] = [];
    for (const candidate of merged) {
      if (seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      orderedElements.push(candidate.element);
    }

    return orderedElements;
  }

  private resolveElementBounds(board: Board, element: BoardElement): SpatialBounds | null {
    try {
      const pluginBounds = board.getBounds(element);
      if (!pluginBounds) return null;
      if (
        !isFiniteNumber(pluginBounds.minX) ||
        !isFiniteNumber(pluginBounds.minY) ||
        !isFiniteNumber(pluginBounds.maxX) ||
        !isFiniteNumber(pluginBounds.maxY)
      ) {
        return null;
      }

      const minX = Math.min(pluginBounds.minX, pluginBounds.maxX);
      const minY = Math.min(pluginBounds.minY, pluginBounds.maxY);
      const maxX = Math.max(pluginBounds.minX, pluginBounds.maxX);
      const maxY = Math.max(pluginBounds.minY, pluginBounds.maxY);
      return { minX, minY, maxX, maxY };
    } catch (_error) {
      return null;
    }
  }

  /** 只遍历可见子元素：折叠隐藏的子元素不渲染，也不参与命中 / 框选 */
  private traverseElements(
    board: Board,
    elements: BoardElement[] | undefined,
    visit: (element: BoardElement) => void
  ): void {
    if (!elements || elements.length === 0) return;

    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      visit(element);
      this.traverseElements(board, getHitTestChildren(board, element), visit);
    }
  }
}

export default SpatialHitIndex;
