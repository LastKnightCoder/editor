import { message } from "antd";
import { BoardElement } from "@/components/WhiteBoard/types/board";

const CLIPBOARD_SOURCE = "editor-white-board";

/**
 * 递归移动元素及其 children
 */
function moveElementRecursive(
  element: BoardElement,
  dx: number,
  dy: number,
): void {
  // 移动当前元素
  if (typeof element.x === "number" && typeof element.y === "number") {
    element.x += dx;
    element.y += dy;
  }

  // 移动 points（箭头元素）
  if (element.points && Array.isArray(element.points)) {
    element.points = element.points.map((point: any) => ({
      x: point.x + dx,
      y: point.y + dy,
    }));
  }

  // 递归处理 children（思维导图节点）
  if (element.children && Array.isArray(element.children)) {
    element.children.forEach((child: BoardElement) => {
      moveElementRecursive(child, dx, dy);
    });
  }
}

/**
 * 构建白板剪贴板数据
 */
export function buildWhiteBoardClipboardPayload(
  elements: BoardElement[],
): string | null {
  if (!elements || elements.length === 0) return null;

  // 深拷贝元素数组
  const clonedElements: BoardElement[] = JSON.parse(JSON.stringify(elements));

  // 递归移动所有元素（偏移 20px）
  clonedElements.forEach((element) => {
    moveElementRecursive(element, 20, 20);
  });

  return JSON.stringify({
    source: CLIPBOARD_SOURCE,
    elements: clonedElements,
  });
}

/**
 * 写入剪贴板数据（三重降级策略）
 */
export async function writeClipboardData(payload: string): Promise<boolean> {
  if (!payload) return false;

  // 策略 1: 使用 Clipboard API (最现代)
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      "write" in navigator.clipboard &&
      typeof window !== "undefined" &&
      typeof window.ClipboardItem !== "undefined"
    ) {
      const clipboardItem = new window.ClipboardItem({
        "application/json": new Blob([payload], { type: "application/json" }),
        "text/plain": new Blob([payload], { type: "text/plain" }),
      });
      await navigator.clipboard.write([clipboardItem]);
      return true;
    }
  } catch (error) {
    console.warn("Clipboard API write failed:", error);
  }

  // 策略 2: 使用 writeText (降级方案)
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      navigator.clipboard.writeText
    ) {
      await navigator.clipboard.writeText(payload);
      return true;
    }
  } catch (error) {
    console.warn("Clipboard writeText failed:", error);
  }

  // 策略 3: 使用 execCommand (最后的降级方案)
  if (
    typeof document === "undefined" ||
    typeof document.execCommand !== "function"
  ) {
    return false;
  }

  return new Promise((resolve) => {
    let resolved = false;
    const cleanup = (result: boolean) => {
      if (resolved) return;
      resolved = true;
      document.removeEventListener("copy", handleCopy, true);
      resolve(result);
    };

    const handleCopy = (event: ClipboardEvent) => {
      event.clipboardData?.setData("application/json", payload);
      event.clipboardData?.setData("text/plain", payload);
      event.preventDefault();
      event.stopImmediatePropagation();
      cleanup(true);
    };

    document.addEventListener("copy", handleCopy, true);

    let success = false;
    try {
      success = document.execCommand("copy");
    } catch (error) {
      console.warn("execCommand copy failed:", error);
    }

    if (!success) {
      cleanup(false);
    } else {
      setTimeout(() => cleanup(false), 100);
    }
  });
}

/**
 * 复制元素到剪贴板
 */
export async function copyElementsToClipboard(
  elements: BoardElement[],
): Promise<void> {
  try {
    if (!elements || elements.length === 0) {
      message.error("没有可复制的内容");
      return;
    }

    // 构建剪贴板数据
    const payload = buildWhiteBoardClipboardPayload(elements);
    if (!payload) {
      message.error("无法构建剪贴板数据");
      return;
    }

    // 写入剪贴板
    const success = await writeClipboardData(payload);
    if (!success) {
      message.error("写入剪贴板失败");
      return;
    }

    message.success("已复制到剪贴板");
  } catch (error) {
    console.error("复制失败:", error);
    const errorMessage = error instanceof Error ? error.message : "未知错误";
    message.error(`复制失败: ${errorMessage}`);
  }
}
