import { useState, useRef, useEffect } from "react";
import { MoreOutlined } from "@ant-design/icons";
import { Dropdown, App } from "antd";
import { useMemoizedFn } from "ahooks";
import { MenuProps } from "antd";
import Webview, { WebviewRef } from "@/components/Webview";
import EditText from "@/components/EditText";
import { getProjectItemById, updateProjectItem } from "@/commands";
import {
  importFromMarkdown,
  getContentLength,
  convertHTMLToMarkdown,
  getContentHTML,
} from "@/utils";
import { defaultProjectItemEventBus } from "@/utils";
import { EProjectItemType } from "@/types";
import { useProjectContext } from "../ProjectContext";
import useRightSidebarStore from "@/stores/useRightSidebarStore";
import useProjectsStore from "@/stores/useProjectsStore";

import styles from "./index.module.less";

interface WebViewProjectItemViewProps {
  projectItemId: number;
}

const extractUrlFromTitle = (title: string): { title: string; url: string } => {
  const urlRegex = /\[(https?:\/\/[^\]]+)\]$/;
  const match = title.match(urlRegex);

  if (match && match[1]) {
    return {
      title: title.replace(urlRegex, "").trim(),
      url: match[1],
    };
  }

  return { title, url: "" };
};

const WebViewProjectItemView = (props: WebViewProjectItemViewProps) => {
  const { projectItemId } = props;
  const { projectId } = useProjectContext();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const webviewRef = useRef<WebviewRef>(null);
  const projectItemEventBus = defaultProjectItemEventBus.createEditor();
  const { message } = App.useApp();

  useEffect(() => {
    getProjectItemById(projectItemId).then((projectItem) => {
      const { title: extractedTitle, url: extractedUrl } = extractUrlFromTitle(
        projectItem.title,
      );
      setTitle(extractedTitle);
      setUrl(extractedUrl);
    });
  }, [projectItemId]);

  const handleTitleChange = useMemoizedFn(async (value: string) => {
    if (!value || value === title) return;

    const projectItem = await getProjectItemById(projectItemId);
    const updatedTitle = `${value} [${url}]`;

    const updatedProjectItem = await updateProjectItem({
      ...projectItem,
      title: updatedTitle,
    });

    setTitle(value);

    projectItemEventBus.publishProjectItemEvent(
      "project-item:updated",
      updatedProjectItem,
    );
  });

  const handleClipToDocument = useMemoizedFn(async () => {
    try {
      message.loading({
        content: "正在提取网页内容，需要三到五分钟，请等待...",
        duration: 0,
      });

      const html = await webviewRef.current?.getHTML();
      if (!html) {
        message.error("获取网页内容失败");
        return;
      }

      const contentHTML = getContentHTML(html);
      const markdown = await convertHTMLToMarkdown(contentHTML);
      if (!markdown) {
        message.error("转换网页内容失败");
        return;
      }

      const content = importFromMarkdown(markdown);

      const projectItem = await getProjectItemById(projectItemId);
      const childProjectItem = await useProjectsStore
        .getState()
        .createChildProjectItem(projectId, projectItemId, {
          title: `${title} - 剪藏`,
          content,
          children: [],
          parents: [projectItemId],
          projects: projectItem.projects,
          refType: "",
          refId: 0,
          projectItemType: EProjectItemType.Document,
          count: getContentLength(content),
          whiteBoardContentId: 0,
        });

      if (childProjectItem) {
        message.success("成功剪藏为文档");

        const updatedProjectItem = await getProjectItemById(projectItemId);
        projectItemEventBus.publishProjectItemEvent(
          "project-item:updated",
          updatedProjectItem,
        );
      } else {
        message.error("剪藏失败");
      }
    } catch (error) {
      console.error("Error clipping to document:", error);
      message.error("剪藏失败");
    } finally {
      setTimeout(() => {
        message.destroy();
      }, 2000);
    }
  });

  const moreMenuItems: MenuProps["items"] = [
    {
      key: "clip-to-document",
      label: "剪藏为文档",
    },
    {
      key: "refresh",
      label: "刷新网页",
    },
    {
      key: "open-in-right-sidebar",
      label: "右侧打开",
    },
  ];

  const handleMoreMenuClick: MenuProps["onClick"] = useMemoizedFn(
    async ({ key }) => {
      if (key === "clip-to-document") {
        await handleClipToDocument();
      } else if (key === "refresh") {
        webviewRef.current?.reload();
      } else if (key === "open-in-right-sidebar") {
        if (!url) return;

        const { addTab } = useRightSidebarStore.getState();
        addTab({
          id: url,
          title: title,
          type: "webview",
        });
      }
    },
  );

  if (!url) return null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <EditText
          className={styles.title}
          defaultValue={title}
          contentEditable={true}
          onChange={handleTitleChange}
        />
        <Dropdown
          menu={{
            items: moreMenuItems,
            onClick: handleMoreMenuClick,
          }}
        >
          <div className={styles.icon}>
            <MoreOutlined />
          </div>
        </Dropdown>
      </div>
      <div className={styles.webviewContainer}>
        <Webview
          ref={webviewRef}
          src={url}
          className={styles.webview}
          allowPopups={false}
          onError={(err) => console.error("加载失败:", err)}
        />
      </div>
    </div>
  );
};

export default WebViewProjectItemView;
