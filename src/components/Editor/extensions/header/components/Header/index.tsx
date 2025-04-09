import React from "react";
import { RenderElementProps, useSlate, ReactEditor } from "slate-react";
import classnames from "classnames";
import styles from "./index.module.less";
import { HeaderElement } from "@/components/Editor/types";
import { useHeaderCollapse } from "./hooks";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";
import useHideHeaderDecoration from "@editor/hooks/useHideHeaderDecoration.ts";
import { HeaderContent, DragHandle } from "./components";

interface IHeaderProps {
  attributes: RenderElementProps["attributes"];
  element: HeaderElement;
}

const Header: React.FC<React.PropsWithChildren<IHeaderProps>> = (props) => {
  const { element, attributes, children } = props;
  const { level, collapsed = false } = element;
  const editor = useSlate();
  const path = ReactEditor.findPath(editor, element);

  const hideHeaderDecoration = useHideHeaderDecoration();

  // Use the header collapse hook
  const { toggleCollapse } = useHeaderCollapse({
    editor,
    element,
    path,
  });

  // Use the drag and drop hook
  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      element,
    });

  return (
    <div
      ref={drop}
      className={classnames(styles.container, {
        [styles.dragging]: isDragging,
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
        [styles.collapsed]: collapsed,
        [styles.hideDecoration]: hideHeaderDecoration,
      })}
    >
      <HeaderContent
        level={level}
        collapsed={collapsed}
        toggleCollapse={toggleCollapse}
        attributes={attributes}
      >
        {children}
      </HeaderContent>
      <DragHandle dragRef={drag} canDrag={canDrag} />
    </div>
  );
};

export default Header;
