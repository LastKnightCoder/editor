import React, { PropsWithChildren, useState, useRef, useEffect } from "react";
import { Transforms } from "slate";
import { RenderElementProps, useSlateStatic, ReactEditor, useReadOnly } from "slate-react";
import { BarChart2 } from "lucide-react";
import { useMemoizedFn } from "ahooks";

import type { ChartElement, ChartConfig } from "../../../types";
import ChartPreview from "./ChartPreview";
import ChartEditor from "./ChartEditor";
import AddParagraph from "../../../components/AddParagraph";
import { chartActionsMap } from "../utils/actions";
import { ReactEChartsRef } from "./ReactECharts";

interface ChartBlockProps {
  attributes: RenderElementProps["attributes"];
  element: ChartElement;
}

const ChartBlock: React.FC<PropsWithChildren<ChartBlockProps>> = props => {
  const { attributes, element, children } = props;
  const { data, config, height = 400 } = element;
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReactEChartsRef>(null);
  const resizeStartYRef = useRef(0);
  const startHeightRef = useRef(0);

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

  const updateElement = (newData: ChartElement["data"], newConfig: ChartConfig) => {
    Transforms.setNodes(
      editor,
      { data: newData, config: newConfig },
      { at: ReactEditor.findPath(editor, element) }
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
    const newHeight = Math.max(200, Math.min(800, startHeightRef.current + deltaY));
    updateHeight(newHeight);
  });

  const handleResizeEnd = useMemoizedFn(() => {
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
  });

  const isEmpty = !data || data.length === 0;

  return (
    <div {...attributes} className="relative my-[0.625em]">
      <div contentEditable={false} ref={ref} className="relative transition-all duration-200">
        <div className="cursor-pointer" onClick={handleClick}>
          {isEmpty ? (
            <div className="flex h-[8em] select-none flex-col items-center justify-center gap-[0.5em] text-[var(--ed-text-tertiary)]">
              <BarChart2 size={32} />
              <span>点击编辑图表</span>
            </div>
          ) : (
            <div className="relative h-[400px] p-[1em]" style={{ height }}>
              <ChartPreview ref={chartRef} data={data} config={config} />
            </div>
          )}
        </div>
        {!isEmpty && (
          <div
            className="absolute bottom-0 left-0 z-10 flex h-[10px] w-full cursor-row-resize items-center justify-center"
            onMouseDown={handleResizeStart}
          >
            <div className="h-[0.25em] w-[2em] rounded-[1em] bg-[var(--ed-border)]" />
          </div>
        )}
      </div>
      {children}
      <AddParagraph element={element} />
      {editing && (
        <ChartEditor
          data={data}
          config={config}
          onChange={updateElement}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
};

export default ChartBlock;
