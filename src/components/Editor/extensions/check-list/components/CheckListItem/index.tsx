import React, { PropsWithChildren } from "react";
import { ReactEditor, RenderElementProps, useSlate } from "slate-react";
import { CheckListItemElement } from "@/components/Editor/types";
import { Transforms } from "slate";
import styles from "./index.module.less";
import classnames from "classnames";
import { MdDragIndicator } from "react-icons/md";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop";
import CustomCheckbox from "@/components/CustomCheckbox";
import { useMemoizedFn } from "ahooks";

interface CheckListItemProps {
  attributes: RenderElementProps["attributes"];
  element: CheckListItemElement;
}

const CheckListItem: React.FC<PropsWithChildren<CheckListItemProps>> = (
  props,
) => {
  const { attributes, children, element } = props;
  const { checked } = element;

  const editor = useSlate();

  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      element,
    });

  const onClick = useMemoizedFn(() => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { checked: !checked }, { at: path });
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
      <li {...attributes} className={styles.item}>
        <CustomCheckbox checked={checked} onChange={onClick} />
        <div className={styles.content}>{children}</div>
      </li>
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

export default CheckListItem;
