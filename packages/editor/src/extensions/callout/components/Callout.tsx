import React, { useState, useRef, memo } from "react";
import { Transforms } from "slate";
import {
  RenderElementProps,
  useSlateStatic,
  useReadOnly,
  ReactEditor,
} from "slate-react";
import classnames from "classnames";
import { MdDragIndicator } from "react-icons/md";
import { App } from "antd";

import useTheme from "../../../hooks/useTheme";
import useDragAndDrop from "../../../hooks/useDragAndDrop";
import { useDragHandlerMenu } from "../../../hooks/useDragHandlerMenu";
import type { CalloutElement } from "../../../types";
import AddParagraph from "../../../components/AddParagraph";
import useIsLastElement from "../../../hooks/useIsLastElement";
import EditorContextMenu from "../../../components/EditorContextMenu";
import { buildCalloutMenuItems } from "../utils/menuItems";

import { DEFAULT_TITLE } from "../constants";
import { useMemoizedFn } from "ahooks";

import "./callout.less";

interface ICalloutProps {
  attributes: RenderElementProps["attributes"];
  element: CalloutElement;
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
        className={classnames("dragHandler", {
          canDrag: canDrag,
        })}
        onClick={onClick}
      >
        <MdDragIndicator className="icon" />
      </div>
    );
  },
);

DragHandler.displayName = "DragHandler";

const Callout: React.FC<React.PropsWithChildren<ICalloutProps>> = (props) => {
  const { attributes, element, children } = props;
  const { calloutType, title } = element;
  const defaultTitle = DEFAULT_TITLE[calloutType];
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const [realTitle, setRealTitle] = useState<string>(title || defaultTitle);
  const titleRef = useRef<HTMLParagraphElement>(null);
  const isLast = useIsLastElement(element);
  const { isDark } = useTheme();
  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      element,
    });
  const { message } = App.useApp();

  const { menuProps, dragHandlerProps } = useDragHandlerMenu({
    element,
    editor,
    buildMenuItems: (params) => buildCalloutMenuItems(params, message),
  });

  const handleTitleBlur = useMemoizedFn(() => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      { title: titleRef.current?.innerText },
      { at: path },
    );
    setRealTitle(titleRef.current?.innerText || defaultTitle);
  });

  return (
    <div ref={drop} className="relative group">
      <div {...attributes}>
        <div
          className={classnames(
            "callout relative p-[0.5em] pl-[1em] pb-[1.25em] rounded-[0.5em] border-l-[0.25em]",
            `callout-${calloutType}`,
            {
              dark: isDark,
              dragging: isDragging || (isOverCurrent && canDrop),
              before: isOverCurrent && canDrop && isBefore,
              after: isOverCurrent && canDrop && !isBefore,
            },
          )}
          style={{
            borderLeftColor: "var(--callout-border-color)",
            backgroundColor: "var(--callout-bg-color)",
            color: "var(--callout-text-color)",
          }}
        >
          <div contentEditable={false} style={{ userSelect: "none" }}>
            <p
              data-slate-editor
              ref={titleRef}
              onBlur={handleTitleBlur}
              className={classnames(
                "font-semibold relative pl-[1.5em] mt-[0.625em] mb-[1em] leading-tight",
                "before:content-[''] before:absolute before:w-[1.25em] before:h-[1.25em] before:left-0 before:bg-no-repeat before:bg-left",
                "text-(--callout-text-color)",
              )}
              data-icon-url="var(--callout-icon-url)"
              // @ts-ignore
              contentEditable={!readOnly ? "plaintext-only" : false}
              suppressContentEditableWarning
            >
              {realTitle}
            </p>
          </div>
          <div>{children}</div>
        </div>
        {!(readOnly && isLast) && <AddParagraph element={element} />}
        {!readOnly && (
          <>
            <DragHandler
              drag={drag}
              canDrag={canDrag}
              onClick={dragHandlerProps.onClick}
            />
            <EditorContextMenu {...menuProps} readonly={readOnly} />
          </>
        )}
      </div>
    </div>
  );
};

export default Callout;
