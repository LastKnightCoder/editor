import React from "react";
import { RenderElementProps } from "slate-react";
import AddParagraph from "@/components/Editor/components/AddParagraph";
import { MultiColumnContainerElement } from "@/components/Editor/types";

import styles from "./index.module.less";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";
import classnames from "classnames";
import { MdDragIndicator } from "react-icons/md";

interface IMultiColumnsContainerProps {
  attributes: RenderElementProps["attributes"];
  element: MultiColumnContainerElement;
}

const MultiColumnsContainer: React.FC<
  React.PropsWithChildren<IMultiColumnsContainerProps>
> = (props) => {
  const { attributes, element, children } = props;

  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      element,
    });

  return (
    <div
      ref={drop}
      className={classnames(styles.dropContainer, {
        [styles.dragging]: isDragging,
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
      })}
    >
      <div className={styles.container} {...attributes}>
        {children}
      </div>
      <AddParagraph element={element} />
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

export default MultiColumnsContainer;
