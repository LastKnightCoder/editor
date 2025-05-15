import React, {
  PropsWithChildren,
  useState,
  useEffect,
  useRef,
  useMemo,
} from "react";
import { Transforms } from "slate";
import { ReactEditor, RenderElementProps, useSlate } from "slate-react";
import { Popover, Input, type InputRef } from "antd";
import { useMemoizedFn } from "ahooks";

import { HTMLInlineElement } from "@/components/Editor/types";
import InlineChromiumBugfix from "@/components/Editor/components/InlineChromiumBugFix";

import styles from "./index.module.less";

interface InlineHtmlProps {
  attributes: RenderElementProps["attributes"];
  element: HTMLInlineElement;
}

const InlineHtml: React.FC<PropsWithChildren<InlineHtmlProps>> = (props) => {
  const { attributes, element, children } = props;
  const { html, openEdit = false } = element;
  const editor = useSlate();

  const [inputValue, setInputValue] = useState(html || "");
  const [popoverOpen, setPopoverOpen] = useState(openEdit);
  const inputRef = useRef<InputRef>(null);

  const getElementPath = useMemoizedFn(() =>
    ReactEditor.findPath(editor, element),
  );

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
    const needsUpdate =
      currentVal.trim() !== currentHtml.trim() || element.openEdit;

    if (!currentVal.trim()) {
      Transforms.removeNodes(editor, { at: path });
    } else if (needsUpdate) {
      Transforms.setNodes(
        editor,
        { html: currentVal, openEdit: false },
        { at: path },
      );
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
    const effectiveHtml = popoverOpen ? inputValue : html;

    if (effectiveHtml && effectiveHtml.trim()) {
      return (
        <span
          className={styles.htmlPreviewContent}
          dangerouslySetInnerHTML={{ __html: effectiveHtml }}
        />
      );
    }

    if (popoverOpen) {
      return <span className={styles.placeholder}>输入HTML...</span>;
    } else {
      return <span className={styles.placeholder}>点击编辑HTML</span>;
    }
  }, [
    html,
    inputValue,
    popoverOpen,
    styles.placeholder,
    styles.htmlPreviewContent,
  ]);

  return (
    <span
      {...attributes}
      className={styles.inlineHtml}
      data-element-type="inline-html"
    >
      <InlineChromiumBugfix />
      <Popover
        trigger={"click"}
        open={popoverOpen}
        onOpenChange={handlePopoverOpenChange}
        arrow={false}
        destroyTooltipOnHide
        style={{ maxWidth: 500, marginTop: 10 }}
        placement={"bottom"}
        content={
          <Input
            ref={inputRef}
            size={"large"}
            style={{ width: 500 }}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            placeholder="输入HTML, Esc/回车确认"
          />
        }
      >
        <span className={styles.previewTriggerContainer}>{PreviewDisplay}</span>
      </Popover>
      <InlineChromiumBugfix />
      {children}
    </span>
  );
};

export default InlineHtml;
