import React, { useMemo, useState } from "react";
import { Empty, Modal, Tabs, Button } from "antd";
import { useMemoizedFn } from "ahooks";

import { BaseViewerProps } from "../../../types";
import ArticleViewer from "../ArticleViewer";
import ArticleSelector from "../ArticleSelector";

import If from "@/components/If";
import { SearchResult } from "@/types";

import styles from "./index.module.less";

type TargetKey = React.MouseEvent | React.KeyboardEvent | string;

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

  const onSelectArticle = useMemoizedFn((article: SearchResult) => {
    setSelectorOpen(false);
    addTab({
      id: String(article.id),
      type: "article",
      title: article.title || `文章 #${article.id}`,
    });
  });

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
      <Modal
        open={selectorOpen}
        onCancel={() => setSelectorOpen(false)}
        footer={null}
        width={800}
        destroyOnClose
        styles={{
          body: {
            maxHeight: 800,
          },
        }}
      >
        <ArticleSelector onSelect={onSelectArticle} />
      </Modal>
    </div>
  );
};

export default ArticlesViewer;
