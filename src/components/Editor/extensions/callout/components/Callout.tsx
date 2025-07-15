import React, { useState, useRef, useMemo } from "react";
import { Transforms } from "slate";
import {
  RenderElementProps,
  useSlate,
  useReadOnly,
  ReactEditor,
} from "slate-react";
import classnames from "classnames";
import { MdDragIndicator } from "react-icons/md";
import { Dropdown } from "antd";
import type { MenuProps } from "antd";

import useTheme from "@/components/Editor/hooks/useTheme.ts";
import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";
import { CalloutElement, CalloutType } from "@/components/Editor/types";
import AddParagraph from "@/components/Editor/components/AddParagraph";

import { DEFAULT_TITLE } from "../constants.ts";
import { useMemoizedFn } from "ahooks";

import "./callout.less";

interface ICalloutProps {
  attributes: RenderElementProps["attributes"];
  element: CalloutElement;
}

const trigger = ["click"];

const Callout: React.FC<React.PropsWithChildren<ICalloutProps>> = (props) => {
  const { attributes, element, children } = props;
  const { calloutType, title } = element;
  const defaultTitle = DEFAULT_TITLE[calloutType];
  const editor = useSlate();
  const readOnly = useReadOnly();
  const [realTitle, setRealTitle] = useState<string>(title || defaultTitle);
  const titleRef = useRef<HTMLParagraphElement>(null);

  const { isDark } = useTheme();
  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      element,
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

  const handleTransformCalloutType = useMemoizedFn((newType: CalloutType) => {
    if (newType === calloutType) return;

    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        calloutType: newType,
      },
      { at: path },
    );
    if (realTitle === defaultTitle) {
      setRealTitle(DEFAULT_TITLE[newType]);
    }
  });

  const menu = useMemo(() => {
    const calloutTypeItems: MenuProps["items"] = [
      "tip",
      "info",
      "note",
      "warning",
      "danger",
    ].map((type) => ({
      key: type,
      disabled: type === calloutType,
      label: (
        <div
          className={classnames("flex items-center gap-2", {
            "cursor-not-allowed opacity-50": type === calloutType,
          })}
        >
          <div
            className="w-4 h-4 rounded"
            style={{
              backgroundColor: `var(--callout-${type}-border)`,
            }}
          />
          {DEFAULT_TITLE[type as CalloutType]}
        </div>
      ),
      onClick: () => handleTransformCalloutType(type as CalloutType),
    }));
    return {
      items: calloutTypeItems,
    };
  }, [calloutType]);

  return (
    <div ref={drop} className="relative group">
      <div {...attributes}>
        <div
          className={classnames(
            "callout relative p-[0.5em] pl-[1em] rounded-[0.5em] border-l-[0.25em]",
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
                "text-[var(--callout-text-color)]",
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
        <AddParagraph element={element} />
        {!readOnly && (
          <Dropdown
            menu={menu}
            trigger={trigger as ["click"]}
            disabled={readOnly}
            overlayClassName={classnames("callout-type-dropdown", {
              dark: isDark,
            })}
            placement="bottomRight"
          >
            <div
              contentEditable={false}
              ref={drag}
              className={classnames("dragHandler", {
                canDrag: canDrag,
              })}
            >
              <MdDragIndicator className="icon" />
            </div>
          </Dropdown>
        )}
      </div>
    </div>
  );
};

export default Callout;
