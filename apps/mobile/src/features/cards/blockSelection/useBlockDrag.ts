import { useCallback, useRef, useState, type RefObject } from "react";
import type { EditorRef } from "@tau/editor";
import { Editor, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { useSheetBackDismiss } from "../../../router/useSheetBackDismiss";
import type { MobileEditorToolbarController } from "../editorToolbar/useMobileEditorToolbarController";
import { usePointerReorder, type ItemRect } from "../outline/usePointerReorder";
import { fillBlockRects, type BlockDragState } from "./blockDrag";
import type { BlockDragStartPoint } from "./BlockHandle";
import { moveBlockTo } from "./blockOps";
import { getSlateEditor, measureBlocks } from "./measureBlocks";

type UseBlockDragOptions = {
  editorRef: RefObject<EditorRef | null>;
  /** 编辑器外层 relative 包裹元素，测量与覆盖层的参照 */
  container: HTMLElement | null;
  /** 正文滚动容器（自动滚动与位移的滚动增量） */
  getScrollContainer: () => HTMLElement | null;
  toolbarController: Pick<MobileEditorToolbarController, "dismissKeyboard" | "syncSelection">;
};

type DragSource = Pick<BlockDragState, "rects" | "blockDom">;

/**
 * 编辑器内长按把手拖拽顶层块：开始时收起键盘（保持编辑态），按 usePointerReorder 跟踪指针，
 * 落下后作为一个撤销步移动该块，光标放到其开头但不聚焦；拖拽中系统返回 = 取消。
 */
export function useBlockDrag(options: UseBlockDragOptions) {
  const { editorRef, container, getScrollContainer, toolbarController } = options;
  const [source, setSource] = useState<DragSource | null>(null);
  // 滚动容器内容坐标下的块位置，供引擎在 startDragAt 时同步读取
  const itemRectsRef = useRef<ItemRect[]>([]);

  const reorder = usePointerReorder({
    scrollContainer: getScrollContainer,
    getItemRects: () => itemRectsRef.current,
    onDrop: (from, to) => {
      const editor = getSlateEditor(editorRef);
      if (!editor || !moveBlockTo(editor, from, to)) return;
      Transforms.select(editor, Editor.start(editor, [to]));
      toolbarController.syncSelection();
    },
  });
  const { startDragAt, cancelDrag } = reorder;

  const startDrag = useCallback(
    (index: number, point: BlockDragStartPoint) => {
      const editor = getSlateEditor(editorRef);
      const node = editor?.children[index];
      if (!editor || !container || !node) return;
      let blockDom: HTMLElement;
      try {
        blockDom = ReactEditor.toDOMNode(editor as ReactEditor, node);
      } catch {
        return;
      }
      const measured = measureBlocks(editor, container);
      if (!measured[index]) return;
      toolbarController.dismissKeyboard();
      const rects = fillBlockRects(measured);
      const scroll = getScrollContainer();
      const contentOffset = scroll
        ? container.getBoundingClientRect().top -
          scroll.getBoundingClientRect().top +
          scroll.scrollTop
        : 0;
      itemRectsRef.current = rects.map(rect => ({
        top: rect.top + contentOffset,
        height: rect.height,
      }));
      setSource({ rects, blockDom });
      startDragAt(index, point);
    },
    [container, editorRef, getScrollContainer, startDragAt, toolbarController]
  );

  useSheetBackDismiss(reorder.dragging !== null, cancelDrag);

  const dragging: BlockDragState | null =
    reorder.dragging && source ? { ...reorder.dragging, ...source } : null;

  return { dragging, startDrag, cancelDrag };
}
