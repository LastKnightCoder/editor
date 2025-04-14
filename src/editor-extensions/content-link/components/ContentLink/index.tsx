import React, { useEffect, useState, memo } from "react";
import { Popover } from "antd";
import { RenderElementProps } from "slate-react";

import { ContentLinkElement } from "@/editor-extensions/content-link";
import InlineChromiumBugfix from "@/components/Editor/components/InlineChromiumBugFix";
import Content from "../Content";
import useRightSidebarStore from "@/stores/useRightSidebarStore";

import styles from "./index.module.less";
import { getEditorText } from "@/utils";
import { getContentById } from "@/commands";
import { IContent } from "@/types";

interface IContentLinkProps {
  attributes: RenderElementProps["attributes"];
  element: ContentLinkElement;
  children: React.ReactNode;
}

const ContentLink = memo((props: IContentLinkProps) => {
  const { attributes, children, element } = props;
  const { contentId, contentType, contentTitle, refId } = element;

  const [content, setContent] = useState<IContent | null>(null);

  useEffect(() => {
    getContentById(contentId).then((content) => {
      setContent(content);
    });
  }, [contentId]);

  const handleCardClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const { addTab } = useRightSidebarStore.getState();

    if (addTab && content) {
      addTab({
        id: String(refId),
        type: contentType,
        title: contentTitle || getEditorText(content.content, 10),
      });
    }
  };

  return (
    <Popover
      trigger={"hover"}
      content={<Content content={content} />}
      styles={{
        body: {
          padding: 0,
        },
      }}
      style={{
        top: 20,
      }}
      arrow={false}
      placement={"bottom"}
      mouseEnterDelay={0.5}
    >
      <span
        onClick={handleCardClick}
        className={styles.contentLinkContainer}
        {...attributes}
      >
        <InlineChromiumBugfix />
        {children}
        <InlineChromiumBugfix />
      </span>
    </Popover>
  );
});

export default ContentLink;
