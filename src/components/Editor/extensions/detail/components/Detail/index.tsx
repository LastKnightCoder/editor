import React, { useRef, useState, memo, useEffect } from "react";
import classnames from "classnames";
import { Editor, Transforms } from "slate";
import {
  RenderElementProps,
  useSlateStatic,
  useReadOnly,
  ReactEditor,
} from "slate-react";

import useTheme from "../../../../hooks/useTheme";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";
import useIsLastElement from "@/components/Editor/hooks/useIsLastElement.ts";
import { useDragHandlerMenu } from "@/components/Editor/hooks/useDragHandlerMenu";

import { CaretRightOutlined } from "@ant-design/icons";
import { MdDragIndicator } from "react-icons/md";
import { App } from "antd";

import { DetailElement } from "@/components/Editor/types";

import AddParagraph from "@/components/Editor/components/AddParagraph";
import EditorContextMenu from "@/components/Editor/components/EditorContextMenu";
import { buildDetailMenuItems } from "../../utils/menuItems";
import {
  registerBlockNavigation,
  unregisterBlockNavigation,
} from "@/components/Editor/utils";

import styles from "./index.module.less";

interface ICollapseElementProps {
  attributes: RenderElementProps["attributes"];
  element: DetailElement;
}

const DragHandler = memo(
  ({
    drag,
    canDrag,
    onClick,
  }: {
    drag: React.Ref<HTMLDivElement>;
    canDrag: boolean;
    onClick?: (e: React.MouseEvent) => void;
  }) => {
    return (
      <div
        contentEditable={false}
        ref={drag}
        className={classnames(styles.dragHandler, {
          [styles.canDrag]: canDrag,
        })}
        onClick={onClick}
      >
        <MdDragIndicator className={styles.icon} />
      </div>
    );
  },
);

DragHandler.displayName = "DragHandler";

const Detail: React.FC<React.PropsWithChildren<ICollapseElementProps>> = (
  props,
) => {
  const { attributes, children, element } = props;

  const { open = false } = element;

  const [showContent, setShowContent] = useState(open);
  const [title, setTitle] = useState<string>(element.title || "DETAIL");
  const titleRef = useRef<HTMLDivElement>(null);
  const isLast = useIsLastElement(element);
  const { isDark } = useTheme();
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      element,
    });
  const { message } = App.useApp();

  const { menuProps, dragHandlerProps } = useDragHandlerMenu({
    element,
    editor,
    buildMenuItems: (params) => buildDetailMenuItems(params, message),
  });

  useEffect(() => {
    setShowContent(element.open || false);
  }, [element.open]);

  const onTitleBlur = () => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      { title: titleRef.current?.innerText },
      { at: path },
    );
    setTitle(titleRef.current?.innerText || "DETAIL");
  };

  const toggleShowContent = () => {
    const newOpen = !showContent;
    setShowContent(newOpen);
    // Also update Slate state
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { open: newOpen }, { at: path });
  };

  const arrowClass = classnames(styles.arrow, {
    [styles.show]: showContent,
    [styles.hide]: !showContent,
  });

  const contentClass = classnames(styles.content, {
    [styles.show]: showContent,
    [styles.hide]: !showContent,
  });

  useEffect(() => {
    const focusDetail = (toEnd: boolean) => {
      const path = ReactEditor.findPath(editor, element);

      if (!showContent || !element.open) {
        setShowContent(true);
        Transforms.setNodes(editor, { open: true }, { at: path });
      }

      ReactEditor.focus(editor);
      const point = toEnd
        ? Editor.end(editor, path)
        : Editor.start(editor, path);
      Transforms.select(editor, point);
      return true;
    };

    registerBlockNavigation(element, {
      focusStart: () => focusDetail(false),
      focusEnd: () => focusDetail(true),
    });

    return () => {
      unregisterBlockNavigation(element);
    };
  }, [editor, element, showContent]);

  return (
    <div
      style={{
        position: "relative",
      }}
    >
      <div
        ref={drop}
        className={classnames(styles.container, {
          [styles.dark]: isDark,
          [styles.dragging]: isDragging,
          [styles.drop]: isOverCurrent && canDrop,
          [styles.before]: isBefore,
          [styles.after]: !isBefore,
        })}
      >
        <div
          className={styles.title}
          contentEditable={false}
          style={{ userSelect: "none" }}
        >
          <div className={arrowClass} onClick={toggleShowContent}>
            <CaretRightOutlined />
          </div>
          <div
            data-slate-editor
            ref={titleRef}
            contentEditable={!readOnly}
            suppressContentEditableWarning
            onBlur={onTitleBlur}
          >
            {title}
          </div>
        </div>
        <div className={contentClass}>
          <div {...attributes}>{children}</div>
        </div>
      </div>
      <DragHandler
        drag={drag}
        canDrag={canDrag}
        onClick={dragHandlerProps.onClick}
      />
      <EditorContextMenu {...menuProps} />
      {!(readOnly && isLast) && <AddParagraph element={element} />}
    </div>
  );
};

export default Detail;
