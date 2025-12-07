import React, { PropsWithChildren } from "react";
import { RenderElementProps } from "slate-react";
import classnames from "classnames";
import { MdDragIndicator } from "react-icons/md";

import { type DivideLineElement } from "../../../types";
import AddParagraph from "../../../../components/AddParagraph";
import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import useThemeColors from "../../../../hooks/useThemeColors";

interface DivideLineProps {
  attributes: RenderElementProps["attributes"];
  element: DivideLineElement;
}

const DivideLineElement: React.FC<PropsWithChildren<DivideLineProps>> = (
  props,
) => {
  const { attributes, children, element } = props;

  const { accentColor } = useThemeColors();
  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      element,
    });

  return (
    <div
      ref={drop}
      className={classnames("relative group", {
        "opacity-50": isDragging || (isOverCurrent && canDrop),
      })}
    >
      {isOverCurrent && canDrop && isBefore && (
        <div
          className="absolute -top-[0.625em] left-0 right-0 h-[0.125em]"
          style={{ backgroundColor: "var(--active-text-color)" }}
        />
      )}

      <div
        {...attributes}
        contentEditable={false}
        className="w-4/5 h-[0.125em] my-12 mx-auto"
        style={{ backgroundColor: accentColor }}
      >
        {children}
        <AddParagraph element={element} />
      </div>

      <div
        contentEditable={false}
        ref={drag}
        className={classnames(
          "absolute -top-3 -left-5 w-5 h-7 select-none flex items-center justify-center cursor-pointer opacity-0 transition-opacity",
          {
            "group-hover:opacity-100": canDrag,
          },
        )}
      >
        <MdDragIndicator className="-translate-y-0.5 text-(--text-normal)" />
      </div>
      {isOverCurrent && canDrop && !isBefore && (
        <div
          className="absolute bottom-[0.375em] left-0 right-0 h-[0.125em]"
          style={{ backgroundColor: "var(--active-text-color)" }}
        />
      )}
    </div>
  );
};

export default DivideLineElement;
