import { produce } from "immer";
import { v4 as getUuid } from "uuid";
import {
  BoardElement,
  FrameElement,
  FRAME_DEFAULT_STYLES,
  Operation,
  Board,
} from "../types";
import { isRectIntersect, getRectIntersectionArea, PathUtil } from "./index";
import { canNest } from "./Constraints";

const LOCAL_STORAGE_KEY = "whiteboard-frame";

export class FrameUtil {
  static setLocalStorage(key: string, value: string) {
    const realKey = `${LOCAL_STORAGE_KEY}-${key}`;
    localStorage.setItem(realKey, value);
  }

  static getLocalStorage(key: string) {
    const realKey = `${LOCAL_STORAGE_KEY}-${key}`;
    return localStorage.getItem(realKey);
  }

  static getPrevFrameStyle() {
    const backgroundColor =
      this.getLocalStorage("backgroundColor") ||
      FRAME_DEFAULT_STYLES[0].backgroundColor;
    const borderColor =
      this.getLocalStorage("borderColor") ||
      FRAME_DEFAULT_STYLES[0].borderColor;
    const borderWidth = parseInt(
      this.getLocalStorage("borderWidth") ||
        FRAME_DEFAULT_STYLES[0].borderWidth.toString(),
    );
    const borderRadius = parseInt(
      this.getLocalStorage("borderRadius") ||
        FRAME_DEFAULT_STYLES[0].borderRadius.toString(),
    );

    return {
      backgroundColor,
      borderColor,
      borderWidth,
      borderRadius,
    } as const;
  }

  static createFrame(
    x: number,
    y: number,
    width: number,
    height: number,
    title = "Frame",
  ): FrameElement {
    const prevStyle = this.getPrevFrameStyle();

    return {
      id: getUuid(),
      type: "frame",
      x,
      y,
      width,
      height,
      title,
      children: [],
      backgroundColor: prevStyle.backgroundColor,
      borderColor: prevStyle.borderColor,
      borderWidth: prevStyle.borderWidth,
      borderRadius: prevStyle.borderRadius,
      padding: 20,
      containmentPolicy: "partial",
      removalPolicy: "partial",
      autoResize: true,
      minWidth: 100,
      minHeight: 60,
    };
  }

  static addChildToFrame(
    frame: FrameElement,
    child: BoardElement,
  ): FrameElement {
    // 需要保证 child 不在 frame 中
    if (frame.children.some((c: BoardElement) => c.id === child.id)) {
      return frame;
    }

    // 嵌套约束：frame 不允许嵌套 frame，且不能包含 arrow
    if (!canNest(frame, child)) {
      return frame;
    }

    return produce(frame, (draft) => {
      draft.children.push(child);
    });
  }

  static removeChildFromFrame(
    frame: FrameElement,
    childId: string,
  ): FrameElement {
    return produce(frame, (draft) => {
      draft.children = draft.children.filter(
        (child: BoardElement) => child.id !== childId,
      );
    });
  }

  /**
   * 计算元素相对于Frame的位置
   */
  static getRelativePosition(
    element: BoardElement,
    frame: FrameElement,
  ): { x: number; y: number } {
    return {
      x: element.x - frame.x,
      y: element.y - frame.y,
    };
  }

  /**
   * 检查元素是否在Frame的边界内
   */
  static isElementInBounds(
    element: BoardElement,
    frame: FrameElement,
    padding = 0,
  ): boolean {
    const bounds = {
      x: frame.x - padding,
      y: frame.y - padding,
      width: frame.width + 2 * padding,
      height: frame.height + 2 * padding,
    };

    return (
      element.x >= bounds.x &&
      element.x + (element.width || 0) <= bounds.x + bounds.width &&
      element.y >= bounds.y &&
      element.y + (element.height || 0) <= bounds.y + bounds.height
    );
  }

  /**
   * 检查元素是否在Frame内部
   */
  static isElementInFrame(
    element: BoardElement,
    frame: FrameElement,
    policy: "full" | "partial" = "partial",
  ): boolean {
    const frameBounds = {
      x: frame.x - frame.padding,
      y: frame.y - frame.padding,
      width: frame.width + 2 * frame.padding,
      height: frame.height + 2 * frame.padding,
    };

    const elementBounds = {
      x: element.x,
      y: element.y,
      width: element.width || 0,
      height: element.height || 0,
    };

    if (policy === "full") {
      // 全部在Frame内部
      return (
        elementBounds.x >= frameBounds.x &&
        elementBounds.x + elementBounds.width <=
          frameBounds.x + frameBounds.width &&
        elementBounds.y >= frameBounds.y &&
        elementBounds.y + elementBounds.height <=
          frameBounds.y + frameBounds.height
      );
    } else {
      const isIntersect = isRectIntersect(elementBounds, frameBounds);
      if (!isIntersect) return false;

      const intersectionArea = getRectIntersectionArea(
        elementBounds,
        frameBounds,
      );
      const elementArea = elementBounds.width * elementBounds.height;
      const intersectionRatio = intersectionArea / elementArea;
      return intersectionRatio > 0.5; // 50% 以上算进入
    }
  }

  static calculateFrameBounds(
    frame: FrameElement,
    children: BoardElement[] = frame.children,
  ) {
    if (children.length === 0) {
      return {
        x: frame.x,
        y: frame.y,
        width: Math.max(frame.minWidth, frame.width),
        height: Math.max(frame.minHeight, frame.height),
      };
    }

    // 计算所有子元素的边界
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    children.forEach((child: BoardElement) => {
      minX = Math.min(minX, child.x);
      minY = Math.min(minY, child.y);
      maxX = Math.max(maxX, child.x + (child.width || 0));
      maxY = Math.max(maxY, child.y + (child.height || 0));
    });

    // 计算需要的边界（包含 padding）
    const requiredMinX = minX - frame.padding;
    const requiredMinY = minY - frame.padding;
    const requiredMaxX = maxX + frame.padding;
    const requiredMaxY = maxY + frame.padding;

    // 如果 frame 当前的边界已经足够包含所有子元素（包括 padding），则保持原样
    // 否则扩展 frame 的边界
    const newX = Math.min(frame.x, requiredMinX);
    const newY = Math.min(frame.y, requiredMinY);
    const newMaxX = Math.max(frame.x + frame.width, requiredMaxX);
    const newMaxY = Math.max(frame.y + frame.height, requiredMaxY);

    return {
      x: newX,
      y: newY,
      width: Math.max(frame.minWidth, newMaxX - newX),
      height: Math.max(frame.minHeight, newMaxY - newY),
    };
  }

  /**
   * 计算 Frame 的边界，使得 Frame 能够完全包含所有子元素
   */
  static calculateFrameFitBounds(
    frame: FrameElement,
    children: BoardElement[] = frame.children,
  ) {
    if (children.length === 0) {
      return {
        x: frame.x,
        y: frame.y,
        width: Math.max(frame.minWidth, frame.width),
        height: Math.max(frame.minHeight, frame.height),
      };
    }

    // 计算所有子元素的边界
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    children.forEach((child: BoardElement) => {
      minX = Math.min(minX, child.x);
      minY = Math.min(minY, child.y);
      maxX = Math.max(maxX, child.x + (child.width || 0));
      maxY = Math.max(maxY, child.y + (child.height || 0));
    });

    return {
      x: minX - frame.padding,
      y: minY - frame.padding,
      width: maxX - minX + 2 * frame.padding,
      height: maxY - minY + 2 * frame.padding,
    };
  }

  /**
   * 调整Frame大小以适应所有子元素
   */
  static resizeToFitChildren(board: any, frame: FrameElement) {
    const children = frame.children.filter(
      (el: BoardElement) => el.type !== "frame",
    );

    const newBounds = this.calculateFrameBounds(frame, children);

    const framePath = PathUtil.getPathByElement(board, frame);
    if (framePath) {
      board.apply([
        {
          type: "set_node",
          path: framePath,
          properties: frame,
          newProperties: {
            ...frame,
            x: newBounds.x,
            y: newBounds.y,
            width: newBounds.width,
            height: newBounds.height,
          },
        },
      ]);
    }
  }

  /**
   * 计算包围所有子元素的最小矩形
   */
  static calculateBoundingRect(elements: BoardElement[]): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    if (elements.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    elements.forEach((element) => {
      minX = Math.min(minX, element.x);
      minY = Math.min(minY, element.y);
      maxX = Math.max(maxX, element.x + (element.width || 0));
      maxY = Math.max(maxY, element.y + (element.height || 0));
    });

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * 检查是否需要调整Frame大小
   */
  static shouldResizeFrame(
    frame: FrameElement,
    children: BoardElement[],
    padding = 20,
  ): boolean {
    if (children.length === 0) return false;

    const bounds = this.calculateBoundingRect(children);
    const requiredWidth = bounds.width + 2 * padding;
    const requiredHeight = bounds.height + 2 * padding;

    return requiredWidth > frame.width || requiredHeight > frame.height;
  }

  static dfs(
    frame: BoardElement,
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
    before?.(frame, parent, index);
    frame.children?.forEach((child, index) => {
      this.dfs(
        child,
        {
          before,
          after,
        },
        frame,
        index,
      );
    });
    after?.(frame, parent, index);
  }

  /**
   * 移动 Frame 及其所有子元素
   */
  static moveAll(frame: FrameElement, dx: number, dy: number): FrameElement {
    return produce(frame, (draft) => {
      this.dfs(draft, {
        before: (element) => {
          element.x += dx;
          element.y += dy;
        },
      });
    });
  }

  static getAllChildren(frame: FrameElement): BoardElement[] {
    const children: BoardElement[] = [];
    this.dfs(frame, {
      after: (element) => {
        children.push(element);
      },
    });
    return children;
  }

  static isChildInFrame(frame: FrameElement, child: BoardElement): boolean {
    let hasChild = false;
    this.dfs(frame, {
      before: (element) => {
        if (child.id === frame.id) return;
        if (element.id === child.id) {
          hasChild = true;
        }
      },
    });

    return hasChild;
  }

  static unwrapFrame(board: Board, frame: FrameElement) {
    const ops: Operation[] = [];

    // 使用 move_node 将 frame 的子元素移动到 board.children
    frame.children.forEach((child) => {
      const oldPath = PathUtil.getPathByElement(board, child);
      if (!oldPath) return;

      // 新路径：移动到 board.children 的末尾
      const newPath = [board.children.length];

      ops.push({
        type: "move_node",
        path: oldPath,
        newPath,
      });
    });

    const path = PathUtil.getPathByElement(board, frame);
    if (!path) return false;

    // 删除 frame 本身
    ops.push({
      type: "remove_node",
      path,
      node: {
        ...frame,
        // 清空 children，保证 undo 时不会重复添加
        children: [],
      },
    });

    board.apply(ops);

    return true;
  }
}
