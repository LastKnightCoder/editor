import React, { useMemo, useState } from "react";
import { Empty, Tabs, Button } from "antd";
import { useMemoizedFn } from "ahooks";

import { BaseViewerProps } from "../../../types";
import ArticleViewer from "../ArticleViewer";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import {
  fileAttachmentExtension,
  cardLinkExtension,
} from "@/editor-extensions";

import If from "@/components/If";
import { SearchResult } from "@/types";

import styles from "./index.module.less";

type TargetKey = React.MouseEvent | React.KeyboardEvent | string;

const customExtensions = [fileAttachmentExtension, cardLinkExtension];

const ArticlesViewer: React.FC<BaseViewerProps> = ({
  addTab,
  removeTab,
  updateTab,
  setActiveTabKey,
  activeTabKey,
  tabs,
}) => {
  const [selectorOpen, setSelectorOpen] = useState(false);

  const tabsItems = useMemo(() => {
    return tabs.map((tab) => {
      return {
        key: String(tab.id),
        label: tab.title,
        children: (
          <ArticleViewer
            articleId={String(tab.id)}
            onTitleChange={(title) => {
              updateTab({
                id: String(tab.id),
                type: "article",
                title,
              });
            }}
          />
        ),
      };
    });
  }, [tabs, updateTab]);

  const handleTabChange = useMemoizedFn((activeKey: string) => {
    setActiveTabKey({
      id: String(activeKey),
      type: "article",
      title:
        tabs.find((tab) => Number(tab.id) === Number(activeKey))?.title || "",
    });
  });

  const handleEdit = useMemoizedFn(
    (targetKey: TargetKey, action: "add" | "remove") => {
      if (action === "add") {
        setSelectorOpen(true);
      } else if (action === "remove") {
        removeTab({
          id: targetKey as string,
          type: "article",
          title: "",
        });
      }
    },
  );

  const onSelectArticle = useMemoizedFn(
    (items: SearchResult | SearchResult[]) => {
      setSelectorOpen(false);
      if (Array.isArray(items)) {
        // 处理多选的情况
        items.forEach((article) => {
          addTab({
            id: String(article.id),
            type: "article",
            title: article.title || `文章 #${article.id}`,
          });
        });
      } else {
        // 单选情况
        addTab({
          id: String(items.id),
          type: "article",
          title: items.title || `文章 #${items.id}`,
        });
      }
    },
  );

  return (
    <div className={styles.container}>
      <If condition={tabs.length === 0}>
        <Empty description="暂无文章" className={styles.empty}>
          <Button onClick={() => setSelectorOpen(true)}>选择文章</Button>
        </Empty>
      </If>
      <If condition={tabs.length > 0}>
        <Tabs
          items={tabsItems}
          activeKey={String(activeTabKey)}
          onChange={handleTabChange}
          type="editable-card"
          onEdit={handleEdit}
          tabBarGutter={10}
          animated={true}
        />
      </If>
      <ContentSelectorModal
        open={selectorOpen}
        onCancel={() => setSelectorOpen(false)}
        onSelect={onSelectArticle}
        contentType="article"
        extensions={customExtensions}
        emptyDescription="暂无文章"
        showTitle={true}
        multiple={true}
      />
    </div>
  );
};

export default ArticlesViewer;
