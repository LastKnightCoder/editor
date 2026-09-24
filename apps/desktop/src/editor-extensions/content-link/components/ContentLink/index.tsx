import React, { useEffect, useState, memo } from "react";
import { Popover } from "antd";
import { RenderElementProps } from "slate-react";

import type { ContentLinkElement } from "../../types";
import { InlineChromiumBugfix, useCollaboration } from "@tau/editor/src";
import Content from "../Content";
import { toast } from "@tau/ui";
import { openContent } from "@/services/open-content";

import styles from "./index.module.less";
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

  const collaboration = useCollaboration();
  // 协作者本机没有被引用内容，查询本地库还可能命中同 ID 的无关内容，直接降级为提示。
  const remoteView = Boolean(
    collaboration && collaboration.mode !== "local" && collaboration.role !== "owner"
  );

  useEffect(() => {
    if (remoteView) {
      setContent(null);
      return;
    }
    getContentById(contentId).then(content => {
      setContent(content);
    });
  }, [contentId, remoteView]);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!content || remoteView) return;
    try {
      await openContent(contentType, refId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "打开内容失败");
    }
  };

  return (
    <Popover
      trigger={"hover"}
      content={
        remoteView ? (
          <div className={styles.unsharedTip}>
            {contentTitle ? `${contentTitle} · ` : ""}内容未共享，仅保存在创建者本机
          </div>
        ) : (
          <Content content={content} />
        )
      }
      styles={{
        content: {
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
      <span onClick={handleClick} className={styles.contentLinkContainer} {...attributes}>
        <InlineChromiumBugfix />
        {children}
        <InlineChromiumBugfix />
      </span>
    </Popover>
  );
});

export default ContentLink;
