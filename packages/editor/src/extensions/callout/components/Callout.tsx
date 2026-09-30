import React, { useState, useRef } from "react";
import { Transforms } from "slate";
import { RenderElementProps, useSlateStatic, useReadOnly, ReactEditor } from "slate-react";
import { cn } from "@tau/ui";

import type { CalloutElement } from "../../../types";
import AddParagraph from "../../../components/AddParagraph";
import useIsLastElement from "../../../hooks/useIsLastElement";

import { DEFAULT_TITLE } from "../constants";
import { useMemoizedFn } from "ahooks";

interface ICalloutProps {
  attributes: RenderElementProps["attributes"];
  element: CalloutElement;
}

const Callout: React.FC<React.PropsWithChildren<ICalloutProps>> = props => {
  const { attributes, element, children } = props;
  const { calloutType, title } = element;
  const defaultTitle = DEFAULT_TITLE[calloutType];
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const [realTitle, setRealTitle] = useState<string>(title || defaultTitle);
  const titleRef = useRef<HTMLParagraphElement>(null);
  const isLast = useIsLastElement(element);

  const handleTitleBlur = useMemoizedFn(() => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { title: titleRef.current?.innerText }, { at: path });
    setRealTitle(titleRef.current?.innerText || defaultTitle);
  });

  return (
    <div className="relative">
      <div {...attributes}>
        <div
          className={cn(
            "callout relative rounded-[0.5em] border-l-[0.25em] p-[0.5em] pb-[1.25em] pl-[1em]",
            `callout-${calloutType}`
          )}
          style={{
            borderLeftColor: "var(--ed-callout-border)",
            backgroundColor: "var(--ed-callout-bg)",
            color: "var(--ed-callout-text)",
          }}
        >
          <div contentEditable={false} style={{ userSelect: "none" }}>
            <p
              data-slate-editor
              ref={titleRef}
              onBlur={handleTitleBlur}
              className={cn(
                "relative mb-[1em] mt-[0.625em] pl-[1.5em] font-semibold leading-tight",
                "before:bg-(--ed-callout-border) before:absolute before:left-0 before:h-[1.25em] before:w-[1.25em] before:content-['']",
                "before:[mask-image:var(--ed-callout-icon)] before:[mask-position:left_center] before:[mask-repeat:no-repeat] before:[mask-size:contain]",
                "text-(--ed-callout-text)"
              )}
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
      </div>
    </div>
  );
};

export default Callout;
