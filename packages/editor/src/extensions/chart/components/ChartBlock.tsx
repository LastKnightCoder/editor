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
import styles from "./ChartBlock.module.less";

interface ChartBlockProps {
  attributes: RenderElementProps["attributes"];
  element: ChartElement;
}

const ChartBlock: React.FC<PropsWithChildren<ChartBlockProps>> = (props) => {
  const { attributes, element, children } = props;
  const { data, config } = element;
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const themeColors = useThemeColors();

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
            <div className={styles.preview}>
              <ChartPreview data={data} config={config} />
            </div>
          )}
        </div>
      </div>
      <div
        contentEditable={false}
        ref={canDrag ? drag : undefined}
        className={classnames(styles.dragHandler, {
          [styles.canDrag]: canDrag,
        })}
        onClick={dragHandlerProps.onClick}
      >
        <MdDragIndicator className={styles.icon} />
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
