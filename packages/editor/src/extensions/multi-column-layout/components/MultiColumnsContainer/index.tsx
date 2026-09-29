import React, { useRef, useMemo, useCallback, useState, useEffect } from "react";
import { RenderElementProps, useReadOnly, useSlate, ReactEditor } from "slate-react";
import { Transforms } from "slate";
import { Trash2 } from "lucide-react";
import AddParagraph from "../../../../components/AddParagraph";
import type { MultiColumnContainerElement } from "../../../types";
import useIsLastElement from "../../../../hooks/useIsLastElement";
import { useDragHandlerMenu } from "../../../../hooks/useDragHandlerMenu";
import EditorContextMenu from "../../../../components/EditorContextMenu";
import type { BuildMenuParams } from "../../../../components/EditorContextMenu/types";
import { deleteNode } from "../../../../utils/nodeOperations";

import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import { cn } from "@tau/ui";
import {
  BLOCK_DRAG_GROUP,
  DragHandle,
  DropIndicator,
  dimWhileDragging,
} from "../../../../components/BlockDrag";
import ColumnResizer from "../ColumnResizer";
import { ColumnWidthsContext } from "../../context/ColumnWidthsContext";

interface IMultiColumnsContainerProps {
  attributes: RenderElementProps["attributes"];
  element: MultiColumnContainerElement;
}

function buildMultiColumnsMenuItems(params: BuildMenuParams<MultiColumnContainerElement>) {
  const { editor, path } = params;

  return [
    {
      key: "delete",
      label: "删除",
      icon: <Trash2 size={16} />,
      danger: true,
      onSelect: () => deleteNode(editor, path),
    },
  ];
}

const MultiColumnsContainer: React.FC<
  React.PropsWithChildren<IMultiColumnsContainerProps>
> = props => {
  const { attributes, element, children } = props;
  const editor = useSlate();
  const readOnly = useReadOnly();
  const isLast = useIsLastElement(element);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [resizingIndex, setResizingIndex] = useState<number | null>(null);
  const [previewWidths, setPreviewWidths] = useState<number[] | null>(null);

  // 用于存储清理函数的 ref
  const cleanupRef = useRef<(() => void) | null>(null);

  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } = useDragAndDrop({
    element,
  });

  const { menuProps, dragHandlerProps } = useDragHandlerMenu({
    element,
    editor,
    buildMenuItems: buildMultiColumnsMenuItems,
  });

  const columnCount = element.children.length;
  const { ref: attributesRef, ...restAttributes } =
    attributes as RenderElementProps["attributes"] & {
      ref?: React.Ref<HTMLDivElement>;
    };

  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      if (!attributesRef) return;
      if (typeof attributesRef === "function") {
        attributesRef(node);
        return;
      }
      try {
        (attributesRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      } catch {
        // 忽略不可写 ref
      }
    },
    [attributesRef]
  );

  // 获取当前列宽数组（百分比）
  const getColumnWidths = useCallback((): number[] => {
    if (element.columnWidths && element.columnWidths.length === columnCount) {
      return [...element.columnWidths];
    }
    // 默认平均分配
    const defaultWidth = 100 / columnCount;
    return Array(columnCount).fill(defaultWidth);
  }, [element.columnWidths, columnCount]);

  // 保存列宽到 Slate 节点
  const saveColumnWidths = useCallback(
    (widths: number[]) => {
      try {
        const path = ReactEditor.findPath(editor, element);
        Transforms.setNodes(editor, { columnWidths: widths }, { at: path });
      } catch (e) {
        console.error("Failed to save column widths:", e);
      }
    },
    [editor, element]
  );

  // 组件卸载时清理事件监听器
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  const startResize = useCallback(
    (
      startX: number,
      leftColumnIndex: number,
      mode: "pointer" | "mouse",
      pointerId?: number,
      targetElement?: HTMLElement
    ) => {
      if (!containerRef.current) {
        return;
      }

      const containerRect = containerRef.current.getBoundingClientRect();
      const containerWidth = containerRect.width;
      if (!containerWidth) {
        return;
      }

      const initialWidths = getColumnWidths();
      const minWidthPercent = 10;
      const listenerOptions = { capture: true } as const;

      setResizingIndex(leftColumnIndex);
      setPreviewWidths(initialWidths);

      if (mode === "pointer" && targetElement && typeof pointerId === "number") {
        targetElement.setPointerCapture(pointerId);
      }

      const handleMove = (moveEvent: PointerEvent | MouseEvent) => {
        moveEvent.preventDefault();
        moveEvent.stopPropagation();

        const deltaX = moveEvent.clientX - startX;
        const deltaPercent = (deltaX / containerWidth) * 100;

        const newWidths = [...initialWidths];
        const rightColumnIndex = leftColumnIndex + 1;

        let newLeftWidth = initialWidths[leftColumnIndex] + deltaPercent;
        let newRightWidth = initialWidths[rightColumnIndex] - deltaPercent;

        if (newLeftWidth < minWidthPercent) {
          newLeftWidth = minWidthPercent;
          newRightWidth =
            initialWidths[leftColumnIndex] + initialWidths[rightColumnIndex] - minWidthPercent;
        }
        if (newRightWidth < minWidthPercent) {
          newRightWidth = minWidthPercent;
          newLeftWidth =
            initialWidths[leftColumnIndex] + initialWidths[rightColumnIndex] - minWidthPercent;
        }

        newWidths[leftColumnIndex] = newLeftWidth;
        newWidths[rightColumnIndex] = newRightWidth;

        setPreviewWidths(newWidths);
      };

      const cleanup = () => {
        if (mode === "pointer" && targetElement && typeof pointerId === "number") {
          try {
            if (targetElement.hasPointerCapture(pointerId)) {
              targetElement.releasePointerCapture(pointerId);
            }
          } catch {
            // 忽略释放失败（元素可能已不存在）
          }
        }

        setPreviewWidths(currentWidths => {
          if (currentWidths) {
            saveColumnWidths(currentWidths);
          }
          return null;
        });

        setResizingIndex(null);

        if (mode === "pointer") {
          document.removeEventListener("pointermove", handleMove, listenerOptions);
          document.removeEventListener("pointerup", handleEnd, listenerOptions);
          document.removeEventListener("pointercancel", handleEnd, listenerOptions);
        } else {
          document.removeEventListener("mousemove", handleMove, listenerOptions);
          document.removeEventListener("mouseup", handleEnd, listenerOptions);
        }

        cleanupRef.current = null;
      };

      const handleEnd = (endEvent: PointerEvent | MouseEvent) => {
        endEvent.preventDefault();
        endEvent.stopPropagation();
        cleanup();
      };

      cleanupRef.current = cleanup;

      if (mode === "pointer") {
        document.addEventListener("pointermove", handleMove, listenerOptions);
        document.addEventListener("pointerup", handleEnd, listenerOptions);
        document.addEventListener("pointercancel", handleEnd, listenerOptions);
      } else {
        document.addEventListener("mousemove", handleMove, listenerOptions);
        document.addEventListener("mouseup", handleEnd, listenerOptions);
      }
    },
    [getColumnWidths, saveColumnWidths]
  );

  // 处理指针调整开始
  const handleResizeStart = useCallback(
    (e: React.PointerEvent, leftColumnIndex: number) => {
      if (cleanupRef.current) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();

      startResize(e.clientX, leftColumnIndex, "pointer", e.pointerId, e.target as HTMLElement);
    },
    [startResize]
  );

  // 处理鼠标调整开始（作为 pointer 事件的兼容兜底）
  const handleMouseResizeStart = useCallback(
    (e: React.MouseEvent, leftColumnIndex: number) => {
      if (cleanupRef.current) {
        return;
      }
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      startResize(e.clientX, leftColumnIndex, "mouse");
    },
    [startResize]
  );

  // 计算调整器位置
  const resizerPositions = useMemo(() => {
    const widths = previewWidths || getColumnWidths();
    const positions: number[] = [];
    let accumulated = 0;

    for (let i = 0; i < columnCount - 1; i++) {
      accumulated += widths[i];
      positions.push(accumulated);
    }

    return positions;
  }, [previewWidths, getColumnWidths, columnCount]);

  // Context value for preview widths
  const contextValue = useMemo(
    () => ({
      previewWidths,
    }),
    [previewWidths]
  );

  return (
    <ColumnWidthsContext.Provider value={contextValue}>
      <div
        ref={node => {
          drop(node);
        }}
        className={cn(
          "relative",
          BLOCK_DRAG_GROUP,
          dimWhileDragging(isDragging || (isOverCurrent && canDrop))
        )}
      >
        <DropIndicator active={isOverCurrent && canDrop} before={isBefore} />
        {/* gap 值需与 MultiColumnItem/index.tsx 中的 GAP_EM 保持同步 */}
        <div ref={setContainerRef} className="flex flex-nowrap gap-[0.625em]" {...restAttributes}>
          {children}
        </div>
        {/* 列宽调整器 */}
        {!readOnly && columnCount > 1 && (
          <div
            className="pointer-events-none absolute inset-0 z-20 [&>*]:pointer-events-auto"
            contentEditable={false}
          >
            {resizerPositions.map((position, index) => (
              <ColumnResizer
                key={index}
                isResizing={resizingIndex === index}
                onResizeStart={e => handleResizeStart(e, index)}
                onMouseResizeStart={e => handleMouseResizeStart(e, index)}
                style={{ left: `${position}%` }}
              />
            ))}
          </div>
        )}
        {!(readOnly && isLast) && <AddParagraph element={element} />}
        <DragHandle
          dragRef={node => {
            drag(node);
          }}
          canDrag={canDrag}
          onClick={dragHandlerProps.onClick}
        />
        <EditorContextMenu {...menuProps} readonly={readOnly} />
      </div>
    </ColumnWidthsContext.Provider>
  );
};

export default MultiColumnsContainer;
