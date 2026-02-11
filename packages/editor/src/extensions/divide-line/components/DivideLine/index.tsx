import React, { PropsWithChildren } from "react";
import { RenderElementProps, useSlate, useReadOnly } from "slate-react";
import classnames from "classnames";
import { MdDragIndicator } from "react-icons/md";
import { Trash2 } from "lucide-react";

import { type DivideLineElement } from "../../../types";
import AddParagraph from "../../../../components/AddParagraph";
import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import useThemeColors from "../../../../hooks/useThemeColors";
import { useDragHandlerMenu } from "../../../../hooks/useDragHandlerMenu";
import EditorContextMenu from "../../../../components/EditorContextMenu";
import { deleteNode } from "../../../../utils/nodeOperations";
import type { BuildMenuParams } from "../../../../components/EditorContextMenu/types";

interface DivideLineProps {
  attributes: RenderElementProps["attributes"];
  element: DivideLineElement;
}

/**
 * 构建分割线菜单项
 */
function buildDivideLineMenuItems(params: BuildMenuParams<DivideLineElement>) {
  const { editor, path } = params;

  return [
    {
      key: "delete",
      label: "删除",
      icon: <Trash2 size={16} />,
      danger: true,
      onSelect: () => deleteNode(editor, path),
    },
  ];
}

const DivideLineElement: React.FC<PropsWithChildren<DivideLineProps>> = (
  props,
) => {
  const { attributes, children, element } = props;

  const editor = useSlate();
  const readOnly = useReadOnly();
  const { accentColor } = useThemeColors();
  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      element,
    });

  // 菜单功能
  const { menuProps, dragHandlerProps } = useDragHandlerMenu({
    element,
    editor,
    buildMenuItems: buildDivideLineMenuItems,
  });

  return (
    <div
      ref={(node) => {
        drop(node);
      }}
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
        ref={(node) => {
          drag(node);
        }}
        className={classnames(
          "absolute -top-3 -left-5 w-5 h-7 select-none flex items-center justify-center cursor-pointer opacity-0 transition-opacity",
          {
            "group-hover:opacity-100": canDrag,
          },
        )}
        onClick={dragHandlerProps.onClick}
      >
        <MdDragIndicator className="-translate-y-0.5 text-(--text-normal)" />
      </div>
      {isOverCurrent && canDrop && !isBefore && (
        <div
          className="absolute bottom-[0.375em] left-0 right-0 h-[0.125em]"
          style={{ backgroundColor: "var(--active-text-color)" }}
        />
      )}
      <EditorContextMenu {...menuProps} readonly={readOnly} />
    </div>
  );
};

export default DivideLineElement;
