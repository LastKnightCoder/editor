import React, { useEffect, useMemo, memo } from "react";
import { Editor, Transforms } from "slate";
import {
  ReactEditor,
  RenderElementProps,
  useSlate,
  useReadOnly,
} from "slate-react";

import classnames from "classnames";
import { App } from "antd";

import { MdDragIndicator } from "react-icons/md";

import type { ParagraphElement } from "../../../types";
import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import { useDragHandlerMenu } from "../../../../hooks/useDragHandlerMenu";
import EditorContextMenu from "../../../../components/EditorContextMenu";
import { buildParagraphMenuItems } from "../../utils/menuItems";

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
    onClick,
  }: {
    drag: any;
    canDrag: boolean;
    disableDrag?: boolean;
    onClick?: (e: React.MouseEvent) => void;
  }) => {
    return (
      <div
        contentEditable={false}
        ref={(node) => {
          drag(node);
        }}
        className={classnames(styles.dragHandler, {
          [styles.canDrag]: canDrag,
          [styles.disableDrag]: disableDrag,
        })}
        onClick={onClick}
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
    const readOnly = useReadOnly();
    const path = ReactEditor.findPath(editor, element);
    const isLast = (() => {
      if (path.length === 1) {
        return path[0] === editor.children.length - 1;
      }
      try {
        const parent = Editor.parent(editor, path);
        if (parent) {
          return parent[0].children.length - 1 === path[path.length - 1];
        }
        return false;
      } catch (error) {
        return false;
      }
    })();
    const { message } = App.useApp();

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

    // 菜单功能
    const { menuProps, dragHandlerProps } = useDragHandlerMenu({
      element,
      editor,
      buildMenuItems: (params) => buildParagraphMenuItems(params, message),
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
      <div
        ref={(node) => {
          drop(node);
        }}
        className={styles.container}
      >
        <p
          {...attributes}
          className={classnames(paragraphClassName, { "mb-0!": isLast })}
        >
          {children}
        </p>
        <DragHandler
          drag={drag}
          canDrag={canDrag}
          disableDrag={disableDrag}
          onClick={dragHandlerProps.onClick}
        />
        <EditorContextMenu {...menuProps} readonly={readOnly} />
      </div>
    );
  },
);

export default Paragraph;
