import React, { useMemo, useState } from "react";
import { Empty, Button } from "antd";
import { useMemoizedFn } from "ahooks";

import { BaseViewerProps } from "../../../types";
import DocumentItemViewer from "../DocumentItemViewer";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import {
  fileAttachmentExtension,
  cardLinkExtension,
  documentCardListExtension,
} from "@/editor-extensions";
import TabsIndicator from "@/components/TabsIndicator";

import styles from "./index.module.less";
import If from "@/components/If";
import { SearchResult } from "@/types/search";

const customExtensions = [
  fileAttachmentExtension,
  cardLinkExtension,
  documentCardListExtension,
];

const DocumentItemsViewer: React.FC<BaseViewerProps> = ({
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
      type: "document-item",
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
      type: "document-item",
      title: "",
    });
  });

  const onSelectDocumentItem = useMemoizedFn(
    (items: SearchResult | SearchResult[]) => {
      setSelectorOpen(false);
      if (Array.isArray(items)) {
        // 处理多选的情况
        items.forEach((documentItem) => {
          addTab({
            id: String(documentItem.id),
            type: "document-item",
            title: documentItem.title || "文档",
          });
        });
      } else {
        // 单选情况
        addTab({
          id: String(items.id),
          type: "document-item",
          title: items.title || "文档",
        });
      }
    },
  );

  const activeDocumentItem = tabs.find(
    (tab) => String(tab.id) === activeTabKey,
  );

  return (
    <div className={styles.container}>
      <If condition={tabs.length === 0}>
        <Empty description="暂无文档" className={styles.empty}>
          <Button onClick={() => setSelectorOpen(true)}>选择文档</Button>
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
            {activeDocumentItem && (
              <DocumentItemViewer
                documentItemId={String(activeDocumentItem.id)}
                onTitleChange={(title: string) => {
                  updateTab({
                    id: String(activeDocumentItem.id),
                    type: "document-item",
                    title,
                  });
                }}
              />
            )}
          </div>
        </div>
      </If>
      <ContentSelectorModal
        open={selectorOpen}
        onCancel={() => setSelectorOpen(false)}
        onSelect={onSelectDocumentItem}
        contentType="document-item"
        extensions={customExtensions}
        emptyDescription="无结果"
        showTitle={true}
        multiple={true}
      />
    </div>
  );
};

export default DocumentItemsViewer;
