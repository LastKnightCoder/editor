import React, { PropsWithChildren } from "react";
import { RenderElementProps } from "slate-react";
import classnames from "classnames";
import { BlockquoteElement } from "@/components/Editor/types";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";
import useThemeColors from "@/hooks/useThemeColors";
import { MdDragIndicator } from "react-icons/md";

interface IBlockQuoteProps {
  attributes: RenderElementProps["attributes"];
  element: BlockquoteElement;
}

const Blockquote: React.FC<PropsWithChildren<IBlockQuoteProps>> = (props) => {
  const { attributes, element, children } = props;

  const { badgeBgClass, secondaryTextClass } = useThemeColors();
  const { drag, drop, isDragging, isBefore, isOverCurrent, canDrop, canDrag } =
    useDragAndDrop({
      element,
    });

  return (
    <div ref={drop} className="relative group my-2">
      <div {...attributes} className="relative">
        <div
          className={classnames(
            "relative pl-6 italic leading-relaxed transition-colors duration-200",
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
          {/* Decorative Bar */}
          <div
            contentEditable={false}
            className={classnames(
              "absolute left-0 top-1 bottom-1 w-1 rounded-full select-none",
              badgeBgClass,
            )}
          />
          {children}
        </div>

        {/* Drag Handler */}
        <div
          contentEditable={false}
          ref={drag}
          className={classnames(
            "absolute -left-4 top-1 w-4 h-6 flex items-center justify-center cursor-grab opacity-0 group-hover:opacity-100 transition-opacity",
            {
              "cursor-grab hover:bg-gray-100 dark:hover:bg-gray-800 rounded":
                canDrag,
            },
          )}
        >
          <MdDragIndicator className="text-gray-400 dark:text-gray-500 text-lg" />
        </div>
      </div>
    </div>
  );
};

export default Blockquote;
