import React, { PropsWithChildren, useState, useEffect, useRef, useMemo } from "react";
import { Transforms } from "slate";
import { ReactEditor, RenderElementProps, useSlateStatic } from "slate-react";
import { Input, Popover } from "@tau/ui";
import { useMemoizedFn } from "ahooks";
import { useTailwindRuntimeCss } from "../../../../hooks/useTailwindRuntimeCss";
import { IRuntimeStyleCompiler } from "@tau/shared/runtime-style";

import type { HTMLInlineElement } from "../../../../types";
import { InlineChromiumBugfix } from "@tau/editor/api";

interface InlineHtmlProps {
  attributes: RenderElementProps["attributes"];
  element: HTMLInlineElement;
}

const InlineHtml: React.FC<PropsWithChildren<InlineHtmlProps>> = props => {
  const { attributes, element, children } = props;
  const { html, openEdit = false } = element;
  const editor = useSlateStatic();
  const [inputValue, setInputValue] = useState(html || "");
  const [popoverOpen, setPopoverOpen] = useState(openEdit);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewHtml = popoverOpen ? inputValue : html;
  const tailwindCss = useTailwindRuntimeCss(
    html,
    "html",
    editor.tryGetService(IRuntimeStyleCompiler)
  );

  const getElementPath = useMemoizedFn(() => ReactEditor.findPath(editor, element));

  useEffect(() => {
    setPopoverOpen(openEdit);
    if (openEdit) {
      setInputValue(element.html || "");
    }
  }, [openEdit, element.html]);

  useEffect(() => {
    if (popoverOpen) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [popoverOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const submitHtmlAndClose = useMemoizedFn((currentVal: string) => {
    const path = getElementPath();
    if (!path) return;

    const currentHtml = element.html || "";
    const needsUpdate = currentVal.trim() !== currentHtml.trim() || element.openEdit;

    if (!currentVal.trim()) {
      Transforms.removeNodes(editor, { at: path });
    } else if (needsUpdate) {
      Transforms.setNodes(editor, { html: currentVal, openEdit: false }, { at: path });
    } else if (element.openEdit) {
      Transforms.setNodes(editor, { openEdit: false }, { at: path });
    }
    setPopoverOpen(false);
  });

  const handlePopoverOpenChange = useMemoizedFn((visible: boolean) => {
    if (!visible) {
      submitHtmlAndClose(inputValue);
    } else {
      setInputValue(element.html || "");
      setPopoverOpen(true);
    }
  });

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitHtmlAndClose(inputValue);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      submitHtmlAndClose(inputValue);
    }
  };

  const PreviewDisplay = useMemo(() => {
    if (previewHtml && previewHtml.trim()) {
      return <span dangerouslySetInnerHTML={{ __html: previewHtml }} />;
    }

    return (
      <span className="select-none italic text-[var(--ed-text-tertiary)]">
        {popoverOpen ? "输入HTML..." : "点击编辑HTML"}
      </span>
    );
  }, [previewHtml, popoverOpen]);

  return (
    <span {...attributes} className="inline-block align-baseline" data-element-type="inline-html">
      <InlineChromiumBugfix />
      {tailwindCss ? <style dangerouslySetInnerHTML={{ __html: tailwindCss }} /> : null}
      <Popover
        open={popoverOpen}
        onOpenChange={handlePopoverOpenChange}
        arrow={false}
        placement="bottom"
        className="w-[500px] max-w-[calc(100vw-16px)] p-2"
        trigger={
          <span className="inline-block cursor-pointer rounded-[3px] px-[3px] py-px">
            {PreviewDisplay}
          </span>
        }
      >
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          placeholder="输入HTML, Esc/回车确认"
        />
      </Popover>
      <InlineChromiumBugfix />
      {children}
    </span>
  );
};

export default InlineHtml;
