import React, { useEffect, useMemo, memo } from "react";
import { Editor, Transforms } from "slate";
import { ReactEditor, RenderElementProps, useSlate } from "slate-react";

import classnames from "classnames";

import { MdDragIndicator } from "react-icons/md";

import { ParagraphElement } from "@/components/Editor/types";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";

import styles from "./index.module.less";
import { useMemoizedFn } from "ahooks";

interface IParagraphProps {
  attributes: RenderElementProps["attributes"];
  element: ParagraphElement;
}

// 拆分出拖拽指示器组件
const DragHandler = memo(
  ({
    drag,
    canDrag,
    disableDrag,
  }: {
    drag: any;
    canDrag: boolean;
    disableDrag?: boolean;
  }) => {
    return (
      <div
        contentEditable={false}
        ref={drag}
        className={classnames(styles.dragHandler, {
          [styles.canDrag]: canDrag,
          [styles.disableDrag]: disableDrag,
        })}
      >
        <MdDragIndicator className={styles.icon} />
      </div>
    );
  },
);

const Paragraph: React.FC<React.PropsWithChildren<IParagraphProps>> = memo(
  (props) => {
    const { children, attributes, element } = props;
    const { disableDrag } = element;

    const editor = useSlate();

    const path = useMemo(
      () => ReactEditor.findPath(editor, element),
      [editor, element],
    );

    const isLast = useMemo(
      () => path.length === 1 && editor.children.length - 1 === path[0],
      [path, editor.children.length],
    );

    const {
      drag,
      drop,
      isDragging,
      isBefore,
      isOverCurrent,
      canDrop,
      canDrag,
    } = useDragAndDrop({
      element,
      disableDrag,
    });

    const handleFocus = useMemoizedFn((start = true) => {
      return (e: any) => {
        const { detail } = e;
        if (!detail) return;
        const { focusElement } = detail;
        if (element === focusElement) {
          const path = ReactEditor.findPath(editor, element);
          ReactEditor.focus(editor);
          if (start) {
            Transforms.select(editor, {
              anchor: Editor.start(editor, [...path, 0]),
              focus: Editor.start(editor, [...path, 0]),
            });
          } else {
            Transforms.select(editor, {
              anchor: Editor.end(editor, path),
              focus: Editor.end(editor, path),
            });
          }
        }
      };
    });

    useEffect(() => {
      const handleFocusStart = handleFocus(true);
      const handleFocusEnd = handleFocus(false);

      document.addEventListener("element-focus-start", handleFocusStart);
      document.addEventListener("element-focus-end", handleFocusEnd);

      return () => {
        document.removeEventListener("element-focus-start", handleFocusStart);
        document.removeEventListener("element-focus-end", handleFocusEnd);
      };
    }, [handleFocus]);

    // 使用 useMemo 缓存样式类名
    const paragraphClassName = useMemo(
      () =>
        classnames(styles.paragraph, {
          [styles.dragging]: isDragging,
          [styles.drop]: isOverCurrent && canDrop,
          [styles.before]: isBefore,
          [styles.after]: !isBefore,
          [styles.noMargin]: isLast,
        }),
      [isDragging, isOverCurrent, canDrop, isBefore, isLast],
    );

    return (
      <div ref={drop} className={styles.container}>
        <p {...attributes} className={paragraphClassName}>
          {children}
        </p>
        <DragHandler drag={drag} canDrag={canDrag} disableDrag={disableDrag} />
      </div>
    );
  },
);

export default Paragraph;
