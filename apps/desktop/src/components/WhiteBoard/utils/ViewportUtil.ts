import { BoardElement, ViewPort, ArrowElement, Point } from "../types";

class ViewportUtil {
  static isRectInViewport(
    rect: { x: number; y: number; width: number; height: number },
    viewPort: ViewPort,
    expandPixels = 100,
  ): boolean {
    const { minX, minY, width, height, zoom } = viewPort;

    // 将像素值转换为 viewBox 坐标系单位
    const expandSize = expandPixels / zoom;

    // 扩展后的视口边界
    const vpLeft = minX - expandSize;
    const vpRight = minX + width + expandSize;
    const vpTop = minY - expandSize;
    const vpBottom = minY + height + expandSize;

    // 元素边界
    const elemLeft = rect.x;
    const elemRight = rect.x + rect.width;
    const elemTop = rect.y;
    const elemBottom = rect.y + rect.height;

    // 矩形相交判断：如果两个矩形不相交，则必然满足以下条件之一：
    // 1. 元素完全在视口左边
    // 2. 元素完全在视口右边
    // 3. 元素完全在视口上边
    // 4. 元素完全在视口下边
    // 取反即为相交条件
    return !(
      elemRight < vpLeft ||
      elemLeft > vpRight ||
      elemBottom < vpTop ||
      elemTop > vpBottom
    );
  }

  static getArrowBoundingBox(arrow: ArrowElement): {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null {
    if (!arrow.points || arrow.points.length === 0) return null;

    const xs = arrow.points.map((p: Point) => p.x);
    const ys = arrow.points.map((p: Point) => p.y);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  static isElementInViewport(
    element: BoardElement,
    viewPort: ViewPort,
    expandPixels = 100,
  ): boolean {
    // 对于具有 points 数组的元素（如箭头），使用包围盒
    if (element.points && Array.isArray(element.points)) {
      const boundingBox = this.getArrowBoundingBox(element as ArrowElement);
      if (!boundingBox) return false;
      return this.isRectInViewport(boundingBox, viewPort, expandPixels);
    }

    // 其他元素：使用 x, y, width, height
    const { x, y, width, height } = element;
    if (
      x === undefined ||
      y === undefined ||
      width === undefined ||
      height === undefined
    ) {
      // 如果元素没有位置信息，默认渲染
      return true;
    }

    return this.isRectInViewport(
      { x, y, width, height },
      viewPort,
      expandPixels,
    );
  }
}

export default ViewportUtil;
