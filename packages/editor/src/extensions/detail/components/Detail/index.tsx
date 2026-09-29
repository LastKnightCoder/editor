import React, { useRef, useState, useEffect } from "react";
import { cn } from "@tau/ui";
import { Editor, Transforms } from "slate";
import { RenderElementProps, useSlateStatic, useReadOnly, ReactEditor } from "slate-react";

import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import useIsLastElement from "../../../../hooks/useIsLastElement";
import { useDragHandlerMenu } from "../../../../hooks/useDragHandlerMenu";

import { CaretRight } from "../../../../ui/CaretRight";
import { useNotifier } from "../../../../services/hooks";
import {
  BLOCK_DRAG_GROUP,
  DragHandle,
  DropIndicator,
  dimWhileDragging,
} from "../../../../components/BlockDrag";

import type { DetailElement } from "../../../types";

import AddParagraph from "../../../../components/AddParagraph";
import EditorContextMenu from "../../../../components/EditorContextMenu";
import { buildDetailMenuItems } from "../../utils/menuItems";
import { registerBlockNavigation, unregisterBlockNavigation } from "../../../../utils";

interface ICollapseElementProps {
  attributes: RenderElementProps["attributes"];
  element: DetailElement;
}

const Detail: React.FC<React.PropsWithChildren<ICollapseElementProps>> = props => {
  const { attributes, children, element } = props;

  const { open = false } = element;

  const [showContent, setShowContent] = useState(open);
  const [title, setTitle] = useState<string>(element.title || "DETAIL");
  const titleRef = useRef<HTMLDivElement>(null);
  const isLast = useIsLastElement(element);
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } = useDragAndDrop({
    element,
  });
  const message = useNotifier();

  const { menuProps, dragHandlerProps } = useDragHandlerMenu({
    element,
    editor,
    buildMenuItems: params => buildDetailMenuItems(params, message),
  });

  useEffect(() => {
    setShowContent(element.open || false);
  }, [element.open]);

  const onTitleBlur = () => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { title: titleRef.current?.innerText }, { at: path });
    setTitle(titleRef.current?.innerText || "DETAIL");
  };

  const toggleShowContent = () => {
    const newOpen = !showContent;
    setShowContent(newOpen);
    // Also update Slate state
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { open: newOpen }, { at: path });
  };

  const dropActive = isOverCurrent && canDrop;

  useEffect(() => {
    const focusDetail = (toEnd: boolean) => {
      const path = ReactEditor.findPath(editor, element);

      if (!showContent || !element.open) {
        setShowContent(true);
        Transforms.setNodes(editor, { open: true }, { at: path });
      }

      ReactEditor.focus(editor);
      const point = toEnd ? Editor.end(editor, path) : Editor.start(editor, path);
      Transforms.select(editor, point);
      return true;
    };

    registerBlockNavigation(element, {
      focusStart: () => focusDetail(false),
      focusEnd: () => focusDetail(true),
    });

    return () => {
      unregisterBlockNavigation(element);
    };
  }, [editor, element, showContent]);

  return (
    <div className={cn("relative", BLOCK_DRAG_GROUP)}>
      <div
        ref={node => {
          drop(node);
        }}
        className={cn(
          "relative rounded-[0.5em] border border-[var(--ed-border)] bg-[var(--ed-bg-sunken)] px-[1em] py-[var(--block-distance)] transition-[padding-bottom] duration-200 ease-in-out",
          dimWhileDragging(isDragging || dropActive)
        )}
      >
        <DropIndicator active={dropActive} before={isBefore} />
        <div
          className={cn(
            "flex gap-[0.25em] transition-[margin-bottom] duration-200 ease-in-out",
            showContent && "mb-[calc(var(--block-distance)/2)]"
          )}
          contentEditable={false}
          style={{ userSelect: "none" }}
        >
          <div
            className={cn(
              "cursor-pointer transition-transform duration-200 ease-linear",
              showContent && "rotate-90"
            )}
            onClick={toggleShowContent}
          >
            <CaretRight />
          </div>
          <div
            data-slate-editor
            ref={titleRef}
            contentEditable={!readOnly}
            suppressContentEditableWarning
            onBlur={onTitleBlur}
          >
            {title}
          </div>
        </div>
        <div
          className={cn(
            "grid overflow-hidden pl-[1em] transition-all duration-200 ease-in-out [&>div]:min-h-0",
            showContent ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}
        >
          <div {...attributes}>{children}</div>
        </div>
      </div>
      <DragHandle dragRef={drag} canDrag={canDrag} onClick={dragHandlerProps.onClick} />
      <EditorContextMenu {...menuProps} readonly={readOnly} />
      {!(readOnly && isLast) && <AddParagraph element={element} />}
    </div>
  );
};

export default Detail;
