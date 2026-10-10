import { produce } from "immer";
import { v4 as getUuid } from "uuid";
import { BoardElement, ColumnElement, Board, Operation } from "../types";
import { COLUMN_DEFAULTS } from "../types/column";
import { PathUtil } from "./PathUtil";
import BoardUtil from "./BoardUtil";
import { RichTextUtil } from "./TextStyleStore";
import { createEmptyRichTextContent } from "./RichTextContentUtil";
import type { RichTextElement } from "../plugins/RichTextPlugin";

const TITLE_HEIGHT = COLUMN_DEFAULTS.titleHeight;

/** 各类子元素的数量量词 */
const COLUMN_COUNT_UNITS: Record<string, string> = {
  richtext: "段文字",
  image: "张图片",
  video: "个视频",
  audio: "段音频",
  card: "张卡片",
  whiteboard: "个白板",
};

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
    title = "Column"
  ): ColumnElement {
    return {
      id: getUuid(),
      type: "column",
      x,
      y,
      width: Math.max(COLUMN_DEFAULTS.minWidth, Math.min(width, COLUMN_DEFAULTS.maxWidth)),
      height: 100, // Initial height, will be recalculated
      title,
      children: [],
      padding: COLUMN_DEFAULTS.padding,
      gap: COLUMN_DEFAULTS.gap,
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
    const contentWidth = column.width - COLUMN_DEFAULTS.padding * 2;

    return produce(column, draft => {
      // 间距由设计规范统一，旧数据里的 padding / gap 在布局时归一
      draft.padding = COLUMN_DEFAULTS.padding;
      draft.gap = COLUMN_DEFAULTS.gap;

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
        if (child.naturalWidth && child.naturalHeight && child.naturalWidth > 0) {
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

    if (column.collapsed) return this.getCollapsedHeight(column);

    if (column.children.length === 0) {
      return titleHeight + column.padding * 2 + COLUMN_DEFAULTS.emptyHeight;
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

    if (column.collapsed) return this.getCollapsedHeight(column);

    const titleHeight = TITLE_HEIGHT;

    if (column.children.length === 0) {
      const height = titleHeight + column.padding * 2 + COLUMN_DEFAULTS.emptyHeight; // Minimum height with placeholder
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
   * Check if point is within column bounds
   */
  static isPointInColumn(board: Board, column: ColumnElement, x: number, y: number): boolean {
    // 拖入占位时托盘视觉变高，命中区域同步
    const height = this.calculateHeight(board, column) + this.getDropGrowth(column);
    return x >= column.x && x <= column.x + column.width && y >= column.y && y <= column.y + height;
  }

  /**
   * Check if element is in column bounds
   * 使用鼠标位置判断元素是否进入 Column
   */
  static isElementInColumn(
    board: Board,
    _element: BoardElement,
    column: ColumnElement,
    pointerPosition?: { x: number; y: number }
  ): boolean {
    if (!pointerPosition || column.collapsed) {
      return false;
    }
    return this.isPointInColumn(board, column, pointerPosition.x, pointerPosition.y);
  }

  /**
   * Get drop index for a y position within column
   * @param excludeElementId - 排除某个元素（用于同一容器内拖拽时排除被拖拽的元素）
   */
  static getDropIndex(
    board: Board,
    column: ColumnElement,
    dropY: number,
    excludeElementId?: string
  ): number {
    // 与拖拽时的视觉布局一致：被排除的元素不占位，其余元素依次紧排
    let currentY = column.y + TITLE_HEIGHT + column.padding;
    let dropIndex = 0;

    column.children.forEach((child, index) => {
      if (excludeElementId && child.id === excludeElementId) return;

      const bounds = board.getBounds(child);
      const childHeight = bounds ? bounds.maxY - bounds.minY : child.height || 50;
      if (dropY > currentY + childHeight / 2) {
        dropIndex = index + 1;
      }
      currentY += childHeight + column.gap;
    });

    return dropIndex;
  }

  /** 折叠态高度：标题栏 + 露出的纸边（空列无纸边） */
  static getCollapsedHeight(column: ColumnElement): number {
    return TITLE_HEIGHT + (column.children.length > 0 ? COLUMN_DEFAULTS.collapsedStackHeight : 0);
  }

  /**
   * 切换折叠：与布局合并为一次操作（单条撤销记录）
   */
  static toggleCollapsed(board: Board, column: ColumnElement): void {
    const path = PathUtil.getPathByElement(board, column);
    if (!path) return;
    heightCache.delete(column.id);
    const next = this.layout(board, { ...column, collapsed: !column.collapsed });
    const ops = BoardUtil.diffNode(column, next, path);
    BoardUtil.normalizeOperations(ops);
    board.apply(ops, true);
  }

  /**
   * 在列末尾追加一段空白文字并自动进入编辑（沿用上次的富文本样式）。
   * 插入前按内容宽度实测初始高度，避免插入后再跳高；插入与 relayout 历史合并为一条撤销记录。
   */
  static async appendRichText(board: Board, column: ColumnElement): Promise<string | null> {
    const contentWidth = column.width - column.padding * 2;
    const element: RichTextElement = {
      id: getUuid(),
      type: "richtext",
      // 坐标与高度在测量后按列的最新状态填入
      x: 0,
      y: 0,
      width: contentWidth,
      height: 0,
      maxWidth: contentWidth,
      maxHeight: 1000,
      readonly: false,
      resized: false,
      resizable: false,
      autoHeight: true,
      content: createEmptyRichTextContent(),
      contentId: (await board.extensions?.execute(
        "tau.richtext.create-content",
        createEmptyRichTextContent()
      )) as number | undefined,
      autoFocus: true,
      ...RichTextUtil.load(),
    };
    element.height = await board.capabilityService.measureElementHeight(element, contentWidth);

    // 测量期间列可能被移动 / 删除，按最新状态插入
    const current = BoardUtil.getElementById(board, column.id) as ColumnElement | null;
    const currentPath = current && PathUtil.getPathByElement(board, current);
    if (!current || !currentPath) return null;
    element.x = current.x + current.padding;
    element.y = current.y + this.calculateHeightFromChildren(current);

    board.apply({
      type: "insert_node",
      path: [...currentPath, current.children.length],
      node: element,
    });

    const latest = BoardUtil.getElementById(board, column.id) as ColumnElement | null;
    if (latest) this.relayout(board, latest);
    return element.id;
  }

  /**
   * 标题下方的数量文案：同类元素用对应量词（「3 张图片」），混合时统称「个元素」
   */
  static getCountLabel(column: ColumnElement): string {
    const { children } = column;
    if (children.length === 0) return "空";
    const type = children[0].type;
    const unit =
      children.every(child => child.type === type) && COLUMN_COUNT_UNITS[type]
        ? COLUMN_COUNT_UNITS[type]
        : "个元素";
    return `${children.length} ${unit}`;
  }

  /**
   * 拖入占位块的高度：列内元素取自身高度；外部元素按列内容宽度估算
   * （图片 / 视频按宽高比，其余取当前高度并限制在范围内）
   */
  static getPlaceholderHeight(column: ColumnElement, element: BoardElement): number {
    if (column.children.some(c => c.id === element.id)) {
      return element.height || 50;
    }
    const contentWidth = column.width - column.padding * 2;
    if (element.naturalWidth && element.naturalHeight && element.naturalWidth > 0) {
      return (contentWidth * element.naturalHeight) / element.naturalWidth;
    }
    return Math.min(
      COLUMN_DEFAULTS.placeholderMaxHeight,
      Math.max(COLUMN_DEFAULTS.placeholderMinHeight, element.height || 50)
    );
  }

  /**
   * 外部元素拖入时托盘多出的高度（列内拖拽是「原位合拢 + 落点占位」，总高不变）
   */
  static getDropGrowth(column: ColumnElement): number {
    if (!column.isChildDraggingOver || !column.dropPlaceholderHeight) return 0;
    const isInternal =
      !!column.draggingChildId && column.children.some(c => c.id === column.draggingChildId);
    if (isInternal) return 0;
    return column.dropPlaceholderHeight + (column.children.length > 0 ? column.gap : 0);
  }

  /**
   * 拖拽中的视觉布局：被拖出的子元素原位合拢，落点处空出占位块。
   * 返回每个可见子元素的目标 y、占位块 y，以及托盘高度；存储坐标不变。
   */
  static getVisualLayout(column: ColumnElement): {
    childYs: Map<string, number>;
    placeholderY: number | null;
    placeholderHeight: number;
    height: number;
    isVisuallyEmpty: boolean;
  } {
    const {
      children,
      draggingChildId,
      dropIndex,
      isChildDraggingOver,
      dropPlaceholderHeight = 0,
      padding,
      gap,
    } = column;
    if (column.collapsed) {
      return {
        childYs: new Map(children.map(child => [child.id, child.y])),
        placeholderY: null,
        placeholderHeight: 0,
        height: this.getCollapsedHeight(column),
        isVisuallyEmpty: false,
      };
    }

    const showPlaceholder =
      !!isChildDraggingOver && dropIndex !== undefined && dropPlaceholderHeight > 0;

    const childYs = new Map<string, number>();
    let currentY = column.y + TITLE_HEIGHT + padding;
    let placeholderY: number | null = null;
    let itemCount = 0;

    const placePlaceholder = () => {
      placeholderY = currentY;
      currentY += dropPlaceholderHeight + gap;
      itemCount++;
    };

    children.forEach((child, index) => {
      if (showPlaceholder && dropIndex === index) placePlaceholder();
      if (child.id === draggingChildId) return;
      childYs.set(child.id, currentY);
      currentY += (child.height || 50) + gap;
      itemCount++;
    });
    if (showPlaceholder && placeholderY === null) placePlaceholder();

    const isVisuallyEmpty = itemCount === 0;
    const height = isVisuallyEmpty
      ? TITLE_HEIGHT + padding * 2 + COLUMN_DEFAULTS.emptyHeight
      : currentY - gap + padding - column.y;

    return {
      childYs,
      placeholderY,
      placeholderHeight: dropPlaceholderHeight,
      height,
      isVisuallyEmpty,
    };
  }

  /**
   * Move column and all its children
   */
  static moveAll(column: ColumnElement, dx: number, dy: number): ColumnElement {
    return produce(column, draft => {
      draft.x += dx;
      draft.y += dy;
      // Move children's stored positions as well
      draft.children.forEach(child => {
        child.x += dx;
        child.y += dy;
      });
    });
  }

  /**
   * Remove child from column
   */
  static removeChild(column: ColumnElement, childId: string): ColumnElement {
    return produce(column, draft => {
      draft.children = draft.children.filter(c => c.id !== childId);
    });
  }

  /**
   * Reorder children within column
   */
  static reorderChildren(column: ColumnElement, fromIndex: number, toIndex: number): ColumnElement {
    return produce(column, draft => {
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
    return column.children.some(c => c.id === child.id);
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
      before?: (element: BoardElement, parent: BoardElement | null, index: number) => void;
      after?: (element: BoardElement, parent: BoardElement | null, index: number) => void;
    },
    parent: BoardElement | null = null,
    index = 0
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
        idx
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
      after: element => {
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
  static findParentColumn(board: Board, element: BoardElement): ColumnElement | null {
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
    const latestColumn = BoardUtil.getElementById(board, parentColumn.id) as ColumnElement | null;
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
    column.children.forEach(child => {
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
      element.children?.forEach(child => {
        result.push(child);
        walk(child);
      });
    };
    walk(container);
    return result;
  }
}
