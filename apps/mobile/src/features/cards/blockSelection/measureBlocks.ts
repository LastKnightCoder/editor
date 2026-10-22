import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { EditorRef } from "@tau/editor";
import type { Editor, Node } from "slate";
import { ReactEditor } from "slate-react";

/** 顶层块相对包裹元素的位置 */
export type BlockRect = {
  top: number;
  height: number;
  /** 块首行行高，用于把手 / 勾选圈与首行垂直居中 */
  lineHeight: number;
};

/** 行高取不到（如 normal）时的回退值，接近正文 17px × 1.85 */
export const FALLBACK_LINE_HEIGHT = 30;

export function getSlateEditor(editorRef: RefObject<EditorRef | null>): Editor | null {
  return (editorRef.current?.getEditor() as Editor | undefined) ?? null;
}

function measureNode(editor: Editor, node: Node, containerTop: number): BlockRect | null {
  try {
    const dom = ReactEditor.toDOMNode(editor as ReactEditor, node);
    const rect = dom.getBoundingClientRect();
    const lineHeight = Number.parseFloat(getComputedStyle(dom).lineHeight);
    return {
      top: rect.top - containerTop,
      height: rect.height,
      lineHeight: Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : FALLBACK_LINE_HEIGHT,
    };
  } catch {
    return null;
  }
}

/** 逐个测量 editor.children 的 DOM；映射失效的块记为 null */
export function measureBlocks(editor: Editor, container: HTMLElement): Array<BlockRect | null> {
  const containerTop = container.getBoundingClientRect().top;
  return editor.children.map(node => measureNode(editor, node, containerTop));
}

/** 只测量一个顶层块 */
export function measureBlock(
  editor: Editor,
  container: HTMLElement,
  index: number
): BlockRect | null {
  const node = editor.children[index];
  return node ? measureNode(editor, node, container.getBoundingClientRect().top) : null;
}

/** 与块首行垂直居中的 top */
export function alignToFirstLine(rect: BlockRect, size: number): number {
  return rect.top + (rect.lineHeight - size) / 2;
}

/** 按纵坐标（相对包裹元素）找块：落在块内取该块，块间空隙与首尾外侧归最近的块 */
export function findBlockIndexAtY(
  rects: ReadonlyArray<BlockRect | null>,
  y: number
): number | null {
  let nearest: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  rects.forEach((rect, index) => {
    if (!rect) return;
    const distance =
      y < rect.top ? rect.top - y : y > rect.top + rect.height ? y - rect.top - rect.height : 0;
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  });
  return nearest;
}

/**
 * enabled 时在布局阶段执行 measure：deps 变化（文档、选择、选区）时重算，
 * 编辑器根节点与包裹元素尺寸变化（图片加载、换行）时经 ResizeObserver 重算；未启用时为 null。
 */
export function useBlockMeasure<T>(
  editorRef: RefObject<EditorRef | null>,
  container: HTMLElement | null,
  enabled: boolean,
  measure: (editor: Editor, container: HTMLElement) => T,
  deps: readonly unknown[]
): T | null {
  const [result, setResult] = useState<T | null>(null);
  const measureRef = useRef(measure);
  measureRef.current = measure;

  useLayoutEffect(() => {
    const editor = getSlateEditor(editorRef);
    if (!enabled || !container || !editor) {
      setResult(null);
      return;
    }
    const update = () => setResult(measureRef.current(editor, container));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(container);
    const root = editorRef.current?.getEditableElement();
    if (root) observer.observe(root);
    return () => observer.disconnect();
    // deps 由调用方给出重算时机
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorRef, container, enabled, ...deps]);

  return result;
}
