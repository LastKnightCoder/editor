import React, { PropsWithChildren, memo } from "react";
import { RenderElementProps, useSlate, useReadOnly } from "slate-react";
import classnames from "classnames";
import { BlockquoteElement } from "@/components/Editor/types";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";
import { useDragHandlerMenu } from "@/components/Editor/hooks/useDragHandlerMenu";
import useThemeColors from "@/hooks/useThemeColors";
import EditorContextMenu from "@/components/Editor/components/EditorContextMenu";
import { buildBlockquoteMenuItems } from "../../utils/menuItems";
import { MdDragIndicator } from "react-icons/md";
import { App } from "antd";
import useIsLastElement from "@/components/Editor/hooks/useIsLastElement.ts";
import AddParagraph from "@/components/Editor/components/AddParagraph";

interface IBlockQuoteProps {
  attributes: RenderElementProps["attributes"];
  element: BlockquoteElement;
}

const DragHandler = memo(
  ({
    drag,
    onClick,
  }: {
    drag: React.Ref<HTMLDivElement>;
    onClick?: (e: React.MouseEvent) => void;
  }) => {
    return (
      <div
        contentEditable={false}
        ref={drag}
        className={classnames(
          "absolute -left-[1.25em] top-[0.25em] w-[1em] h-[1.5em] flex items-center justify-center cursor-grab opacity-0 group-hover:opacity-100 transition-all rounded",
        )}
        onClick={onClick}
      >
        <MdDragIndicator className="text-gray-400 dark:text-gray-500 text-lg" />
      </div>
    );
  },
);

DragHandler.displayName = "DragHandler";

const Blockquote: React.FC<PropsWithChildren<IBlockQuoteProps>> = (props) => {
  const { attributes, element, children } = props;

  const { badgeBgClass, secondaryTextClass } = useThemeColors();
  const editor = useSlate();
  const readOnly = useReadOnly();
  const { message } = App.useApp();
  const { drag, drop, isDragging, isBefore, isOverCurrent, canDrop } =
    useDragAndDrop({
      element,
    });
  const isLast = useIsLastElement(element);

  const { menuProps, dragHandlerProps } = useDragHandlerMenu({
    element,
    editor,
    buildMenuItems: (params) => buildBlockquoteMenuItems(params, message),
  });

  // Use badgeBgClass if available, otherwise fallback to blue (gradient2 theme default)
  const blockquoteBorderClass = badgeBgClass || "bg-blue-500";

  return (
    <div ref={drop} className={classnames("relative group")}>
      <div {...attributes} className="relative">
        <div
          className={classnames(
            "relative pl-[1.5em] py-[0.75em] italic leading-relaxed transition-colors duration-200",
            secondaryTextClass,
            {
              "opacity-50": isDragging,
              "bg-blue-50 dark:bg-blue-900/20": isOverCurrent && canDrop,
              "border-t-2 border-blue-500":
                isOverCurrent && canDrop && isBefore,
              "border-b-2 border-blue-500":
                isOverCurrent && canDrop && !isBefore,
            },
          )}
        >
          <div
            contentEditable={false}
            className={classnames(
              "absolute left-0 top-1 bottom-1 w-1 rounded-full select-none",
              blockquoteBorderClass,
            )}
          />
          {children}
        </div>
        <DragHandler drag={drag} onClick={dragHandlerProps.onClick} />
        <EditorContextMenu {...menuProps} />
      </div>
      {!(readOnly && isLast) && <AddParagraph element={element} />}
    </div>
  );
};

export default Blockquote;
