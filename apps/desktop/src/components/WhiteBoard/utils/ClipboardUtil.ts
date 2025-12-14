import { Board, BoardElement, Point } from "../types";
import { isValid } from "./common";

const CLIPBOARD_SOURCE = "editor-white-board";

export const buildClipboardPayload = (
  board: Board,
  elements: BoardElement[],
): string | null => {
  if (!elements || elements.length === 0) return null;

  const clonedElements: BoardElement[] = JSON.parse(JSON.stringify(elements));

  const processedElements = clonedElements
    .map((element) => {
      if (typeof element.x === "number" && typeof element.y === "number") {
        return board.moveElement(element, 20, 20);
      }
      // 对于具有 points 数组的元素（如箭头），移动其路径点
      if (element.points && Array.isArray(element.points)) {
        element.points = element.points.map((point: Point) => ({
          x: point.x + 20,
          y: point.y + 20,
        }));
        return element;
      }
      return element;
    })
    .filter(isValid);

  if (processedElements.length === 0) return null;

  return JSON.stringify({
    source: CLIPBOARD_SOURCE,
    elements: processedElements,
  });
};

export const writeClipboardPayload = async (
  payload: string,
): Promise<boolean> => {
  if (!payload) return false;

  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      "write" in navigator.clipboard &&
      typeof window !== "undefined" &&
      typeof window.ClipboardItem !== "undefined"
    ) {
      const clipboardItem = new window.ClipboardItem({
        "application/json": new Blob([payload], {
          type: "application/json",
        }),
        "text/plain": new Blob([payload], { type: "text/plain" }),
      });
      await navigator.clipboard.write([clipboardItem]);
      return true;
    }
  } catch (error) {
    console.warn("Failed to write clipboard item", error);
  }

  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    navigator.clipboard.writeText
  ) {
    try {
      await navigator.clipboard.writeText(payload);
      return true;
    } catch (error) {
      console.warn("Failed to write clipboard text", error);
    }
  }

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
      console.warn("execCommand copy failed", error);
    }

    if (!success) {
      cleanup(false);
    } else {
      setTimeout(() => cleanup(false), 100);
    }
  });
};

export default {
  buildClipboardPayload,
  writeClipboardPayload,
};
