import React, { useRef, useState } from "react";
import classnames from "classnames";
import { Transforms } from "slate";
import {
  RenderElementProps,
  useSlate,
  useReadOnly,
  ReactEditor,
} from "slate-react";

import useTheme from "../../../../hooks/useTheme";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";

import { CaretRightOutlined } from "@ant-design/icons";
import { MdDragIndicator } from "react-icons/md";

import { DetailElement } from "@/components/Editor/types";

import AddParagraph from "@/components/Editor/components/AddParagraph";

import styles from "./index.module.less";

interface ICollapseElementProps {
  attributes: RenderElementProps["attributes"];
  element: DetailElement;
}

const Detail: React.FC<React.PropsWithChildren<ICollapseElementProps>> = (
  props,
) => {
  const { attributes, children, element } = props;

  const { open = false } = element;

  const [showContent, setShowContent] = useState(open);
  const [title, setTitle] = useState<string>(element.title || "DETAIL");
  const titleRef = useRef<HTMLDivElement>(null);

  const { isDark } = useTheme();
  const editor = useSlate();
  const readOnly = useReadOnly();
  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      element,
    });

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
    setShowContent(!showContent);
  };

  const arrowClass = classnames(styles.arrow, {
    [styles.show]: showContent,
    [styles.hide]: !showContent,
  });

  const contentClass = classnames(styles.content, {
    [styles.show]: showContent,
    [styles.hide]: !showContent,
  });

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
      <div
        contentEditable={false}
        ref={drag}
        className={classnames(styles.dragHandler, {
          [styles.canDrag]: canDrag,
        })}
      >
        <MdDragIndicator className={styles.icon} />
      </div>
      <AddParagraph element={element} />
    </div>
  );
};

export default Detail;
