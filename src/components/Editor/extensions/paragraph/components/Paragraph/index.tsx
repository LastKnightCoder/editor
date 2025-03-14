import React, { useEffect } from "react";
import { Editor, Transforms } from "slate";
import { ReactEditor, RenderElementProps, useSlate } from "slate-react";

import classnames from "classnames";

import { MdDragIndicator } from "react-icons/md";

import { ParagraphElement } from "@/components/Editor/types";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";

import styles from "./index.module.less";

interface IParagraphProps {
  attributes: RenderElementProps["attributes"];
  element: ParagraphElement;
}

const Paragraph: React.FC<React.PropsWithChildren<IParagraphProps>> = (
  props,
) => {
  const { children, attributes, element } = props;

  const editor = useSlate();

  const path = ReactEditor.findPath(editor, element);
  const isLast = path.length === 1 && editor.children.length - 1 === path[0];

  const { drag, drop, isDragging, isBefore, isOverCurrent, canDrop, canDrag } =
    useDragAndDrop({
      element,
    });

  useEffect(() => {
    const handleFocus = (start = true) => {
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
    };

    const handleFocusStart = handleFocus(true);
    const handleFocusEnd = handleFocus(false);

    document.addEventListener("element-focus-start", handleFocusStart);
    document.addEventListener("element-focus-end", handleFocusEnd);

    return () => {
      document.removeEventListener("element-focus-start", handleFocusStart);
      document.removeEventListener("element-focus-end", handleFocusEnd);
    };
  }, [editor, element]);

  return (
    <div ref={drop} className={styles.container}>
      <p
        {...attributes}
        className={classnames(styles.paragraph, {
          [styles.dragging]: isDragging,
          [styles.drop]: isOverCurrent && canDrop,
          [styles.before]: isBefore,
          [styles.after]: !isBefore,
          [styles.noMargin]: isLast,
        })}
      >
        {children}
      </p>
      <div
        contentEditable={false}
        ref={drag}
        className={classnames(styles.dragHandler, {
          [styles.canDrag]: canDrag,
        })}
      >
        <MdDragIndicator className={styles.icon} />
      </div>
    </div>
  );
};

export default Paragraph;
