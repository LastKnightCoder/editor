import React, { useMemo, useState } from "react";
import { Empty, Tabs, Button } from "antd";
import { useMemoizedFn } from "ahooks";

import { BaseViewerProps } from "../../../types";
import DocumentItemViewer from "../DocumentItemViewer";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import {
  fileAttachmentExtension,
  cardLinkExtension,
  documentCardListExtension,
} from "@/editor-extensions";

import styles from "./index.module.less";
import If from "@/components/If";
import { SearchResult } from "@/types/search";

type TargetKey = React.MouseEvent | React.KeyboardEvent | string;

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

  const tabsItems = useMemo(() => {
    return tabs.map((tab) => {
      return {
        key: String(tab.id),
        label: tab.title,
        children: (
          <DocumentItemViewer
            documentItemId={String(tab.id)}
            onTitleChange={(title: string) => {
              updateTab({
                id: String(tab.id),
                type: "document-item",
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
      type: "document-item",
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
          type: "document-item",
          title: "",
        });
      }
    },
  );

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

  return (
    <div className={styles.container}>
      <If condition={tabs.length === 0}>
        <Empty description="暂无文档" className={styles.empty}>
          <Button onClick={() => setSelectorOpen(true)}>选择文档</Button>
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
