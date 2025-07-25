import React, { useMemo, useState } from "react";
import { Empty, Button } from "antd";
import { useMemoizedFn } from "ahooks";

import { BaseViewerProps } from "../../../types";
import ArticleViewer from "../ArticleViewer";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import {
  fileAttachmentExtension,
  contentLinkExtension,
  questionCardExtension,
} from "@/editor-extensions";
import { createArticle } from "@/commands";
import { DEFAULT_ARTICLE_CONTENT } from "@/constants";

import If from "@/components/If";
import { SearchResult } from "@/types";
import TabsIndicator from "@/components/TabsIndicator";

import styles from "./index.module.less";
import { defaultArticleEventBus } from "@/utils";

const customExtensions = [
  fileAttachmentExtension,
  contentLinkExtension,
  questionCardExtension,
];

const ArticlesViewer: React.FC<BaseViewerProps> = ({
  addTab,
  removeTab,
  updateTab,
  setActiveTabKey,
  activeTabKey,
  tabs,
}) => {
  const [selectorOpen, setSelectorOpen] = useState(false);

  const tabItems = useMemo(() => {
    return tabs.map((tab) => ({
      key: String(tab.id),
      label: tab.title,
    }));
  }, [tabs]);

  const handleTabChange = useMemoizedFn((activeKey: string) => {
    setActiveTabKey({
      id: String(activeKey),
      type: "article",
      title:
        tabs.find((tab) => Number(tab.id) === Number(activeKey))?.title || "",
    });
  });

  const handleAddClick = useMemoizedFn(() => {
    setSelectorOpen(true);
  });

  const handleRemoveTab = useMemoizedFn((tabKey: string) => {
    removeTab({
      id: tabKey,
      type: "article",
      title: "",
    });
  });

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

  const onTitleChange = useMemoizedFn((title: string) => {
    updateTab({
      id: String(activeTabKey),
      type: "article",
      title,
    });
  });

  const handleCreateArticle = useMemoizedFn(async () => {
    const article = await createArticle({
      title: "默认文章标题",
      content: DEFAULT_ARTICLE_CONTENT,
      bannerBg: "",
      bannerPosition: "center",
      isTop: false,
      author: "",
      links: [],
      tags: [],
      isDelete: false,
      count: 0,
    });
    defaultArticleEventBus
      .createEditor()
      .publishArticleEvent("article:created", article);
    addTab({
      id: String(article.id),
      type: "article",
      title: article.title || `文章 #${article.id}`,
    });
  });

  const activeArticle = tabs.find((tab) => String(tab.id) === activeTabKey);

  return (
    <div className={styles.container}>
      <If condition={tabs.length === 0}>
        <Empty
          description="暂无文章"
          className="flex flex-col items-center justify-center h-full"
        >
          <div className="flex gap-2">
            <Button onClick={() => setSelectorOpen(true)}>选择文章</Button>
            <Button onClick={handleCreateArticle}>创建文章</Button>
          </div>
        </Empty>
      </If>
      <If condition={tabs.length > 0}>
        <div className={styles.tabsContainer}>
          <TabsIndicator
            tabs={tabItems}
            activeTab={String(activeTabKey)}
            onChange={handleTabChange}
            closable={true}
            onClose={handleRemoveTab}
            showAddButton={true}
            onAdd={handleAddClick}
          />

          <div className={styles.tabContent}>
            {activeArticle && (
              <ArticleViewer
                articleId={String(activeArticle.id)}
                onTitleChange={onTitleChange}
              />
            )}
          </div>
        </div>
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
