import React, { PropsWithChildren } from "react";
import { RenderElementProps, useReadOnly } from "slate-react";
import classnames from "classnames";
import { BlockquoteElement } from "@/components/Editor/types";
import AddParagraph from "@/components/Editor/components/AddParagraph";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";
import useTheme from "../../../../hooks/useTheme";
import useIsLastElement from "@/components/Editor/hooks/useIsLastElement.ts";

import styles from "./index.module.less";
import { MdDragIndicator } from "react-icons/md";

interface IBlockQuoteProps {
  attributes: RenderElementProps["attributes"];
  element: BlockquoteElement;
}

const Blockquote: React.FC<PropsWithChildren<IBlockQuoteProps>> = (props) => {
  const { attributes, element, children } = props;

  const { isDark } = useTheme();
  const { drag, drop, isDragging, isBefore, isOverCurrent, canDrop, canDrag } =
    useDragAndDrop({
      element,
    });
  const isLast = useIsLastElement(element);
  const readOnly = useReadOnly();

  return (
    <div ref={drop} className={styles.container}>
      <div {...attributes}>
        <blockquote
          className={classnames(styles.blockquote, {
            [styles.dark]: isDark,
            [styles.dragging]: isDragging,
            [styles.drop]: isOverCurrent && canDrop,
            [styles.before]: isBefore,
            [styles.after]: !isBefore,
          })}
        >
          {children}
        </blockquote>
        <div
          contentEditable={false}
          ref={drag}
          className={classnames(styles.dragHandler, {
            [styles.canDrag]: canDrag,
          })}
        >
          <MdDragIndicator className={styles.icon} />
        </div>
        {!(readOnly && isLast) && <AddParagraph element={element} />}
      </div>
    </div>
  );
};

export default Blockquote;
