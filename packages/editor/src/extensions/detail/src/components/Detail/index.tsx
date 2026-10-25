import React, { useRef, useState, useEffect } from "react";
import { cn } from "@tau/ui";
import { Editor, Transforms } from "slate";
import { RenderElementProps, useSlateStatic, useReadOnly, ReactEditor } from "slate-react";

import { useIsLastElement } from "@tau/editor/api";

import { EditorCaretRight as CaretRight } from "@tau/editor/api";
import { getCommandElementPath } from "@tau/editor/api";

import type { DetailElement } from "../../types";

import { AddParagraph } from "@tau/editor/api";
import { registerBlockNavigation, unregisterBlockNavigation } from "@tau/editor/api";

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

  useEffect(() => {
    setShowContent(element.open || false);
  }, [element.open, readOnly]);
  useEffect(() => setTitle(element.title || "DETAIL"), [element.title]);

  const onTitleBlur = () => {
    const path = getCommandElementPath(editor, { element });
    if (!path) return;
    Transforms.setNodes(editor, { title: titleRef.current?.innerText }, { at: path });
    setTitle(titleRef.current?.innerText || "DETAIL");
  };

  const toggleShowContent = () => {
    const newOpen = !showContent;
    setShowContent(newOpen);
    const path = getCommandElementPath(editor, { element });
    if (!path) return;
    Transforms.setNodes(editor, { open: newOpen }, { at: path });
  };

  useEffect(() => {
    const focusDetail = (toEnd: boolean) => {
      const path = getCommandElementPath(editor, { element });
      if (!path) return false;

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
    <div className="relative">
      <div className="relative rounded-[0.5em] border border-[var(--ed-border)] bg-[var(--ed-bg-hover)] px-[0.75em]">
        <div
          className={cn("flex items-center gap-[0.375em] py-[0.5em]", readOnly && "cursor-pointer")}
          contentEditable={false}
          style={{ userSelect: "none" }}
          // 只读时标题不可编辑，整行都能展开收起
          onClick={readOnly ? toggleShowContent : undefined}
        >
          <div
            className={cn(
              "grid size-[1.25em] shrink-0 cursor-pointer place-items-center rounded-[0.25em] text-[0.875em] text-[var(--ed-text-secondary)] transition-transform duration-200 ease-out hover:bg-[var(--ed-bg-press)]",
              showContent && "rotate-90"
            )}
            onClick={readOnly ? undefined : toggleShowContent}
          >
            <CaretRight />
          </div>
          <div
            data-slate-editor
            ref={titleRef}
            className="min-w-0 flex-1 font-medium"
            contentEditable={!readOnly}
            suppressContentEditableWarning
            onBlur={onTitleBlur}
          >
            {title}
          </div>
        </div>
        <div
          className={cn(
            "grid overflow-hidden pl-[1.5em] transition-all duration-200 [&>div]:min-h-0",
            showContent ? "grid-rows-[1fr] pb-[0.5em]" : "grid-rows-[0fr]"
          )}
        >
          <div {...attributes}>{children}</div>
        </div>
      </div>
      {!(readOnly && isLast) && <AddParagraph element={element} />}
    </div>
  );
};

export default Detail;
