import { memo } from "react";
import { RenderElementProps, useSlate, useReadOnly } from "slate-react";
import { useNotifier } from "../../../../services/hooks";
import type { HighlightBlockElement } from "../../../types";
import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import useIsLastElement from "../../../../hooks/useIsLastElement";
import { useDragHandlerMenu } from "../../../../hooks/useDragHandlerMenu";

import useTheme from "../../../../hooks/useTheme";

import HighlightBlockPure from "../HighlightBlockPure";
import AddParagraph from "../../../../components/AddParagraph";
import EditorContextMenu from "../../../../components/EditorContextMenu";
import { buildHighlightBlockMenuItems } from "../../utils/menuItems";

import { colors } from "../../configs";

import styles from "./index.module.less";
import classnames from "classnames";
import { MdDragIndicator } from "react-icons/md";

interface IHighBlockProps {
  attributes: RenderElementProps["attributes"];
  element: HighlightBlockElement;
  children: RenderElementProps["children"];
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
  }
);

DragHandler.displayName = "DragHandler";

const HighlightBlock = (props: IHighBlockProps) => {
  const { attributes, element, children } = props;
  const { color } = element;
  const isLast = useIsLastElement(element);
  const { isDark } = useTheme();
  const editor = useSlate();
  const readOnly = useReadOnly();
  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } = useDragAndDrop({
    element,
  });
  const message = useNotifier();

  const { menuProps, dragHandlerProps } = useDragHandlerMenu({
    element,
    editor,
    buildMenuItems: params => buildHighlightBlockMenuItems(params, message),
  });

  const themeColor = colors[color];
  const { backgroundColor, borderColor } = isDark ? themeColor.dark : themeColor.light;

  return (
    <div
      ref={node => {
        drop(node);
      }}
      className={styles.container}
    >
      <DragHandler drag={drag} canDrag={canDrag} onClick={dragHandlerProps.onClick} />
      <EditorContextMenu {...menuProps} readonly={readOnly} />
      <div
        {...attributes}
        className={classnames(styles.highlightBlock, {
          [styles.dragging]: isDragging,
          [styles.drop]: isOverCurrent && canDrop,
          [styles.before]: isBefore,
          [styles.after]: !isBefore,
        })}
      >
        <HighlightBlockPure backgroundColor={backgroundColor} borderColor={borderColor}>
          {children}
        </HighlightBlockPure>
      </div>
      {!(readOnly && isLast) && <AddParagraph element={element} />}
    </div>
  );
};

export default HighlightBlock;
