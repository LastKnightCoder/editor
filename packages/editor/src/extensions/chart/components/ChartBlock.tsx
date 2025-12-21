import React, { PropsWithChildren, useState, useRef, useEffect } from "react";
import { Transforms } from "slate";
import {
  RenderElementProps,
  useSlateStatic,
  ReactEditor,
  useReadOnly,
} from "slate-react";
import { BarChart2 } from "lucide-react";
import classnames from "classnames";
import { useMemoizedFn } from "ahooks";

import type { ChartElement, ChartConfig } from "../../../types";
import ChartPreview from "./ChartPreview";
import ChartEditor from "./ChartEditor";
import useDragAndDrop from "../../../hooks/useDragAndDrop";
import { useDragHandlerMenu } from "../../../hooks/useDragHandlerMenu";
import { MdDragIndicator } from "react-icons/md";
import EditorContextMenu from "../../../components/EditorContextMenu";
import AddParagraph from "../../../components/AddParagraph";
import useThemeColors from "../../../hooks/useThemeColors";
import { buildChartMenuItems, chartActionsMap } from "../utils/menuItems";
import { ReactEChartsRef } from "./ReactECharts";
import styles from "./ChartBlock.module.less";

interface ChartBlockProps {
  attributes: RenderElementProps["attributes"];
  element: ChartElement;
}

const ChartBlock: React.FC<PropsWithChildren<ChartBlockProps>> = (props) => {
  const { attributes, element, children } = props;
  const { data, config, height = 400 } = element;
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReactEChartsRef>(null);
  const themeColors = useThemeColors();
  const resizeStartYRef = useRef(0);
  const startHeightRef = useRef(0);

  const { drag, drop, isDragging, isBefore, isOverCurrent, canDrop, canDrag } =
    useDragAndDrop({ element });

  const { menuProps, dragHandlerProps } = useDragHandlerMenu({
    element,
    editor,
    buildMenuItems: buildChartMenuItems,
  });

  // 注册操作到 actionsMap
  useEffect(() => {
    chartActionsMap.set(element, {
      openEditor: () => setEditing(true),
      getChartInstance: () => chartRef.current?.getInstance() ?? null,
    });
    return () => {
      chartActionsMap.delete(element);
    };
  }, [element]);

  const updateElement = (
    newData: ChartElement["data"],
    newConfig: ChartConfig,
  ) => {
    Transforms.setNodes(
      editor,
      { data: newData, config: newConfig },
      { at: ReactEditor.findPath(editor, element) },
    );
  };

  const handleClick = () => {
    if (readOnly) return;
    setEditing(true);
  };

  const updateHeight = useMemoizedFn((height: number) => {
    if (readOnly) return;
    try {
      const path = ReactEditor.findPath(editor, element);
      Transforms.setNodes(editor, { height }, { at: path });
    } catch (error) {
      console.error("更新图表高度失败:", error);
    }
  });

  const handleResizeStart = useMemoizedFn((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeStartYRef.current = e.clientY;
    startHeightRef.current = height;
    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
  });

  const handleResizeMove = useMemoizedFn((e: MouseEvent) => {
    const deltaY = e.clientY - resizeStartYRef.current;
    const newHeight = Math.max(
      200,
      Math.min(800, startHeightRef.current + deltaY),
    );
    updateHeight(newHeight);
  });

  const handleResizeEnd = useMemoizedFn(() => {
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
  });

  const isEmpty = !data || data.length === 0;

  const containerClassName = classnames(styles.container, {
    [styles.dragging]: isDragging,
    [styles.drop]: isOverCurrent && canDrop,
    [styles.before]: isBefore,
    [styles.after]: !isBefore,
  });

  return (
    <div {...attributes} className={styles.dropContainer}>
      <div contentEditable={false} ref={ref} className={containerClassName}>
        <div ref={drop} className={styles.content} onClick={handleClick}>
          {isEmpty ? (
            <div className={styles.empty}>
              <BarChart2 size={32} />
              <span>点击编辑图表</span>
            </div>
          ) : (
            <div className={styles.preview} style={{ height }}>
              <ChartPreview ref={chartRef} data={data} config={config} />
            </div>
          )}
        </div>
        {!isEmpty && (
          <div className={styles.resizeHandle} onMouseDown={handleResizeStart}>
            <div className={styles.resizeIndicator} />
          </div>
        )}
      </div>
      <div
        contentEditable={false}
        ref={canDrag ? drag : undefined}
        className={classnames(styles.dragHandler, {
          [styles.canDrag]: canDrag,
        })}
        onClick={dragHandlerProps.onClick}
      >
        <MdDragIndicator />
      </div>
      <EditorContextMenu {...menuProps} readonly={readOnly} />
      {children}
      <AddParagraph element={element} />
      {editing && (
        <ChartEditor
          data={data}
          config={config}
          onChange={updateElement}
          onClose={() => setEditing(false)}
          themeColors={themeColors}
        />
      )}
    </div>
  );
};

export default ChartBlock;
