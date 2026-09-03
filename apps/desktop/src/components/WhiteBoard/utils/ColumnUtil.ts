import { produce } from "immer";
import { v4 as getUuid } from "uuid";
import { BoardElement, ColumnElement, Board, Operation } from "../types";
import { COLUMN_DEFAULTS } from "../types/column";
import { PathUtil } from "./PathUtil";
import BoardUtil from "./BoardUtil";

const TITLE_HEIGHT = COLUMN_DEFAULTS.titleHeight;

// 高度缓存，避免频繁重新计算导致性能问题
const heightCache = new Map<string, { height: number; timestamp: number }>();
const CACHE_DURATION = 100; // 100ms 内使用缓存

export class ColumnUtil {
  /**
   * Create a new Column element
   */
  static createColumn(
    x: number,
    y: number,
    width: number = COLUMN_DEFAULTS.width,
    title = "Column",
  ): ColumnElement {
    return {
      id: getUuid(),
      type: "column",
      x,
      y,
      width: Math.max(
        COLUMN_DEFAULTS.minWidth,
        Math.min(width, COLUMN_DEFAULTS.maxWidth),
      ),
      height: 100, // Initial height, will be recalculated
      title,
      children: [],
      padding: COLUMN_DEFAULTS.padding,
      gap: COLUMN_DEFAULTS.gap,
      backgroundColor: COLUMN_DEFAULTS.backgroundColor,
      borderRadius: COLUMN_DEFAULTS.borderRadius,
      shadowEnabled: COLUMN_DEFAULTS.shadowEnabled,
      minWidth: COLUMN_DEFAULTS.minWidth,
      maxWidth: COLUMN_DEFAULTS.maxWidth,
    };
  }

  /**
   * Layout column and children - directly modifies children's x, y, width
   * Similar to MindUtil.layout, this is the core layout algorithm
   */
  static layout(_board: Board, column: ColumnElement): ColumnElement {
    const titleHeight = TITLE_HEIGHT;
    const contentWidth = column.width - column.padding * 2;

    return produce(column, (draft) => {
      let currentY = draft.y + titleHeight + draft.padding;

      draft.children.forEach((child, index) => {
        // Update child position and width directly
        child.x = draft.x + draft.padding;
        child.y = currentY;
        child.width = contentWidth;

        // Column 内的子元素禁止 resize，启用高度自适应
        child.resizable = false;
        child.autoHeight = true;

        // Get the child's height (after width change, height may need recalculation)
        // For elements with naturalWidth/naturalHeight (image, video), recalculate based on aspect ratio
        let childHeight = child.height || 50;
        if (
          child.naturalWidth &&
          child.naturalHeight &&
          child.naturalWidth > 0
        ) {
          const aspectRatio = child.naturalWidth / child.naturalHeight;
          childHeight = contentWidth / aspectRatio;
          child.height = childHeight;
        }

        currentY += childHeight + draft.gap;

        // Don't add gap after last child
        if (index === draft.children.length - 1) {
          currentY -= draft.gap;
        }
      });

      // Calculate final height
      draft.height = this.calculateHeightFromChildren(draft);
    });
  }

  /**
   * Relayout column and apply changes to board
   */
  static relayout(board: Board, column: ColumnElement): ColumnElement {
    // 清除高度缓存，确保使用最新的布局计算
    heightCache.delete(column.id);

    const layoutedColumn = this.layout(board, column);
    const path = PathUtil.getPathByElement(board, column);

    if (path) {
      const ops = BoardUtil.diffNode(column, layoutedColumn, path);
      BoardUtil.normalizeOperations(ops);
      board.apply(ops, true);
    }

    return layoutedColumn;
  }

  /**
   * Calculate height from children without board context
   */
  static calculateHeightFromChildren(column: ColumnElement): number {
    const titleHeight = TITLE_HEIGHT;

    if (column.children.length === 0) {
      return titleHeight + column.padding * 2 + 60;
    }

    let totalHeight = titleHeight + column.padding;

    column.children.forEach((child, index) => {
      const childHeight = child.height || 50;
      totalHeight += childHeight;
      if (index < column.children.length - 1) {
        totalHeight += column.gap;
      }
    });

    totalHeight += column.padding;

    return totalHeight;
  }

  /**
   * Calculate total height based on children
   * 添加缓存机制避免频繁重新计算导致性能问题和强制重排
   */
  static calculateHeight(board: Board, column: ColumnElement): number {
    const now = Date.now();
    const cached = heightCache.get(column.id);

    // 如果缓存有效（100ms 内），直接返回缓存值
    if (cached && now - cached.timestamp < CACHE_DURATION) {
      return cached.height;
    }

    const titleHeight = TITLE_HEIGHT;

    if (column.children.length === 0) {
      const height = titleHeight + column.padding * 2 + 60; // Minimum height with placeholder
      heightCache.set(column.id, { height, timestamp: now });
      return height;
    }

    let totalHeight = titleHeight + column.padding; // Title + top padding

    column.children.forEach((child, index) => {
      const bounds = board.getBounds(child);
      if (bounds) {
        totalHeight += bounds.maxY - bounds.minY;
        if (index < column.children.length - 1) {
          totalHeight += column.gap;
        }
      }
    });

    totalHeight += column.padding; // Bottom padding

    // 缓存计算结果
    heightCache.set(column.id, { height: totalHeight, timestamp: now });

    return totalHeight;
  }

  /**
   * Calculate child position within column
   * Returns the y offset for each child based on stacking order
   */
  static calculateChildPositions(
    board: Board,
    column: ColumnElement,
  ): Map<string, { x: number; y: number; width: number }> {
    const positions = new Map<
      string,
      { x: number; y: number; width: number }
    >();
    const childWidth = column.width - column.padding * 2;
    const titleHeight = TITLE_HEIGHT;
    let currentY = column.y + titleHeight + column.padding;

    column.children.forEach((child, index) => {
      const bounds = board.getBounds(child);
      const childHeight = bounds ? bounds.maxY - bounds.minY : 50;

      positions.set(child.id, {
        x: column.x + column.padding,
        y: currentY,
        width: childWidth,
      });

      currentY += childHeight + column.gap;

      // Don't add gap after last child (consistent with layout method)
      if (index === column.children.length - 1) {
        currentY -= column.gap;
      }
    });

    return positions;
  }

  /**
   * Check if point is within column bounds
   */
  static isPointInColumn(
    board: Board,
    column: ColumnElement,
    x: number,
    y: number,
  ): boolean {
    const height = this.calculateHeight(board, column);
    return (
      x >= column.x &&
      x <= column.x + column.width &&
      y >= column.y &&
      y <= column.y + height
    );
  }

  /**
   * Check if element is in column bounds
   * 使用鼠标位置判断元素是否进入 Column
   */
  static isElementInColumn(
    board: Board,
    _element: BoardElement,
    column: ColumnElement,
    pointerPosition?: { x: number; y: number },
  ): boolean {
    if (!pointerPosition) {
      return false;
    }
    return this.isPointInColumn(
      board,
      column,
      pointerPosition.x,
      pointerPosition.y,
    );
  }

  /**
   * Get drop index for a y position within column
   * @param excludeElementId - 排除某个元素（用于同一容器内拖拽时排除被拖拽的元素）
   */
  static getDropIndex(
    board: Board,
    column: ColumnElement,
    dropY: number,
    excludeElementId?: string,
  ): number {
    const positions = this.calculateChildPositions(board, column);
    let dropIndex = 0;

    column.children.forEach((child, index) => {
      // 跳过被排除的元素（同一容器内拖拽时，排除被拖拽的元素）
      if (excludeElementId && child.id === excludeElementId) {
        return;
      }

      const pos = positions.get(child.id);
      const bounds = board.getBounds(child);
      if (pos && bounds) {
        const childCenterY = pos.y + (bounds.maxY - bounds.minY) / 2;
        if (dropY > childCenterY) {
          dropIndex = index + 1;
        }
      }
    });

    return dropIndex;
  }

  /**
   * Get drop y position for visual indicator
   */
  static getDropY(
    board: Board,
    column: ColumnElement,
    dropIndex: number,
  ): number {
    const positions = this.calculateChildPositions(board, column);
    const titleHeight = TITLE_HEIGHT;

    if (column.children.length === 0 || dropIndex === 0) {
      return column.y + titleHeight + column.padding;
    }

    if (dropIndex >= column.children.length) {
      const lastChild = column.children[column.children.length - 1];
      const pos = positions.get(lastChild.id);
      const bounds = board.getBounds(lastChild);
      if (pos && bounds) {
        return pos.y + (bounds.maxY - bounds.minY) + column.gap / 2;
      }
    }

    const targetChild = column.children[dropIndex];
    const pos = positions.get(targetChild.id);
    if (pos) {
      return pos.y - column.gap / 2;
    }

    return column.y + titleHeight + column.padding;
  }

  /**
   * Move column and all its children
   */
  static moveAll(column: ColumnElement, dx: number, dy: number): ColumnElement {
    return produce(column, (draft) => {
      draft.x += dx;
      draft.y += dy;
      // Move children's stored positions as well
      draft.children.forEach((child) => {
        child.x += dx;
        child.y += dy;
      });
    });
  }

  /**
   * Remove child from column
   */
  static removeChild(column: ColumnElement, childId: string): ColumnElement {
    return produce(column, (draft) => {
      draft.children = draft.children.filter((c) => c.id !== childId);
    });
  }

  /**
   * Reorder children within column
   */
  static reorderChildren(
    column: ColumnElement,
    fromIndex: number,
    toIndex: number,
  ): ColumnElement {
    return produce(column, (draft) => {
      const [removed] = draft.children.splice(fromIndex, 1);
      draft.children.splice(toIndex, 0, removed);
    });
  }

  /**
   * Get content width (column width minus padding)
   */
  static getContentWidth(column: ColumnElement): number {
    return column.width - column.padding * 2;
  }

  /**
   * Check if child is in column
   */
  static isChildInColumn(column: ColumnElement, child: BoardElement): boolean {
    return column.children.some((c) => c.id === child.id);
  }

  /**
   * DFS traverse column and children
   */
  static dfs(
    column: BoardElement,
    {
      before,
      after,
    }: {
      before?: (
        element: BoardElement,
        parent: BoardElement | null,
        index: number,
      ) => void;
      after?: (
        element: BoardElement,
        parent: BoardElement | null,
        index: number,
      ) => void;
    },
    parent: BoardElement | null = null,
    index = 0,
  ) {
    before?.(column, parent, index);
    column.children?.forEach((child, idx) => {
      this.dfs(
        child,
        {
          before,
          after,
        },
        column,
        idx,
      );
    });
    after?.(column, parent, index);
  }

  /**
   * Get all children recursively
   */
  static getAllChildren(column: ColumnElement): BoardElement[] {
    const children: BoardElement[] = [];
    this.dfs(column, {
      after: (element) => {
        if (element.id !== column.id) {
          children.push(element);
        }
      },
    });
    return children;
  }

  /**
   * Find parent Column of an element
   */
  static findParentColumn(
    board: Board,
    element: BoardElement,
  ): ColumnElement | null {
    const parent = BoardUtil.getParent(board, element);
    if (parent && parent.type === "column") {
      return parent as ColumnElement;
    }
    return null;
  }

  /**
   * Relayout parent Column when a child's size changes
   * Call this from child element plugins when their size changes
   */
  static relayoutParentColumn(board: Board, childElement: BoardElement): void {
    const parentColumn = this.findParentColumn(board, childElement);
    if (!parentColumn) return;

    // Get the latest column from board
    const latestColumn = BoardUtil.getElementById(
      board,
      parentColumn.id,
    ) as ColumnElement | null;
    if (!latestColumn) return;

    // Apply layout
    this.relayout(board, latestColumn);
  }

  /**
   * Dissolve column - move children to board root and remove column
   */
  static dissolveColumn(board: Board, column: ColumnElement): boolean {
    const ops: Operation[] = [];

    // Move children to board root
    column.children.forEach((child) => {
      const oldPath = PathUtil.getPathByElement(board, child);
      if (!oldPath) return;

      const newPath = [board.children.length];

      ops.push({
        type: "move_node",
        path: oldPath,
        newPath,
      });
    });

    const path = PathUtil.getPathByElement(board, column);
    if (!path) return false;

    // Remove column
    ops.push({
      type: "remove_node",
      path,
      node: {
        ...column,
        children: [],
      },
    });

    board.apply(ops);

    return true;
  }

  /** 收集容器自身与全部后代（供整体移动使用） */
  static collectDescendants(container: BoardElement): BoardElement[] {
    const result: BoardElement[] = [container];
    const walk = (element: BoardElement) => {
      element.children?.forEach((child) => {
        result.push(child);
        walk(child);
      });
    };
    walk(container);
    return result;
  }
}
