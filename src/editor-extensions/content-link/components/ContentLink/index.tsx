import React, { useEffect, useState, memo } from "react";
import { Popover } from "antd";
import { RenderElementProps } from "slate-react";

import { ContentLinkElement } from "@/editor-extensions/content-link";
import InlineChromiumBugfix from "@/components/Editor/components/InlineChromiumBugFix";
import Content from "../Content";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";

import styles from "./index.module.less";
import { getEditorText } from "@/utils";
import {
  getContentById,
  getProjectItemById,
  getRootDocumentsByDocumentItemId,
} from "@/commands";
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

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const { openInNewTab, panes, activePaneId } = useTabStore.getState();

    if (content) {
      // 确定在哪个 pane 中打开
      let targetPaneId: string | undefined;

      // 如果有多个 pane，尝试在另一个 pane 中打开
      if (panes.length > 1) {
        const otherPane = panes.find((p) => p.id !== activePaneId);
        targetPaneId = otherPane?.id;
      }

      // 根据 contentType 映射到对应的 TabType
      if (contentType === "card") {
        openInNewTab(
          TabType.CardDetail,
          { id: refId },
          targetPaneId,
          contentTitle || getEditorText(content.content, 10),
        );
      } else if (contentType === "article") {
        openInNewTab(
          TabType.ArticleDetail,
          { id: refId },
          targetPaneId,
          contentTitle || getEditorText(content.content, 10),
        );
      } else if (contentType === "project-item") {
        // 获取项目项所属的项目
        try {
          const projectItem = await getProjectItemById(refId);
          if (projectItem && projectItem.projects.length > 0) {
            const projectId = projectItem.projects[0];
            openInNewTab(
              TabType.ProjectDetail,
              {
                id: projectId,
                itemId: refId,
              },
              targetPaneId,
              contentTitle || getEditorText(content.content, 10),
            );
          } else {
            // 如果没有找到项目，回退到项目列表
            openInNewTab(TabType.ProjectList, undefined, targetPaneId);
          }
        } catch (error) {
          console.error("Failed to get project item:", error);
          openInNewTab(TabType.ProjectList, undefined, targetPaneId);
        }
      } else if (contentType === "document-item") {
        // 获取知识库项所属的知识库
        try {
          const documents = await getRootDocumentsByDocumentItemId(refId);
          if (documents && documents.length > 0) {
            const documentId = documents[0].id;
            openInNewTab(
              TabType.DocumentDetail,
              {
                id: documentId,
                itemId: refId,
              },
              targetPaneId,
              contentTitle || getEditorText(content.content, 10),
            );
          } else {
            // 如果没有找到知识库，回退到知识库列表
            openInNewTab(TabType.DocumentList, undefined, targetPaneId);
          }
        } catch (error) {
          console.error("Failed to get document:", error);
          openInNewTab(TabType.DocumentList, undefined, targetPaneId);
        }
      }
    }
  };

  return (
    <Popover
      trigger={"hover"}
      content={<Content content={content} />}
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
      <span
        onClick={handleClick}
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
