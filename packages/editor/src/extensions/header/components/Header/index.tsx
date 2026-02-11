import React from "react";
import { RenderElementProps, useSlateStatic, ReactEditor } from "slate-react";
import classnames from "classnames";
import styles from "./index.module.less";
import type { HeaderElement } from "../../../types";
import { useHeaderCollapse } from "./hooks";
import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import useEditorFeatures from "../../../../hooks/useEditorFeatures";
import { HeaderContent } from "./components";

interface IHeaderProps {
  attributes: RenderElementProps["attributes"];
  element: HeaderElement;
}

const Header: React.FC<React.PropsWithChildren<IHeaderProps>> = (props) => {
  const { element, attributes, children } = props;
  const { level, collapsed = false } = element;
  const editor = useSlateStatic();
  const path = ReactEditor.findPath(editor, element);
  const features = useEditorFeatures();

  const { toggleCollapse } = useHeaderCollapse({
    editor,
    element,
    path,
  });

  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      element,
    });

  // 如果禁用了 Header 折叠功能，则不显示折叠状态
  const effectiveCollapsed = features.disableHeaderCollapse ? false : collapsed;

  return (
    <div
      ref={(node) => {
        drop(node);
      }}
      className={classnames(styles.container, {
        [styles.dragging]: isDragging,
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
        [styles.collapsed]: effectiveCollapsed,
      })}
    >
      <HeaderContent
        level={level}
        collapsed={effectiveCollapsed}
        toggleCollapse={
          features.disableHeaderCollapse ? undefined : toggleCollapse
        }
        attributes={attributes}
        dragRef={drag}
        canDrag={canDrag}
      >
        {children}
      </HeaderContent>
    </div>
  );
};

export default Header;
