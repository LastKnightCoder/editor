import type { ViewPort } from "../types";

class ViewportUtil {
  static isRectInViewport(
    rect: { x: number; y: number; width: number; height: number },
    viewPort: ViewPort,
    expandPixels = 100
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
    return !(elemRight < vpLeft || elemLeft > vpRight || elemBottom < vpTop || elemTop > vpBottom);
  }
}

export default ViewportUtil;
