import React, { PropsWithChildren } from "react";
import { RenderElementProps } from "slate-react";

import { type DivideLineElement } from "@/components/Editor/types";
import AddParagraph from "@/components/Editor/components/AddParagraph";

import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";

import styles from "./index.module.less";
import classnames from "classnames";
import { MdDragIndicator } from "react-icons/md";

interface DivideLineProps {
  attributes: RenderElementProps["attributes"];
  element: DivideLineElement;
}

const DivideLineElement: React.FC<PropsWithChildren<DivideLineProps>> = (
  props,
) => {
  const { attributes, children, element } = props;

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
      })}
    >
      <div
        {...attributes}
        contentEditable={false}
        className={styles.divideLine}
      >
        {children}
        <AddParagraph element={element} />
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
    </div>
  );
};

export default DivideLineElement;
