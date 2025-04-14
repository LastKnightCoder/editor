import React, { useMemo, useState } from "react";
import { Empty, Button } from "antd";
import { useMemoizedFn } from "ahooks";

import { getEditorText } from "@/utils";
import { SearchResult } from "@/types";

import { BaseViewerProps } from "../../../types";
import CardViewer from "../CardViewer";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
} from "@/editor-extensions";
import TabsIndicator from "@/components/TabsIndicator";

import styles from "./index.module.less";
import If from "@/components/If";

const customExtensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
];

const CardsViewer: React.FC<BaseViewerProps> = ({
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
      type: "card",
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
      type: "card",
      title: "",
    });
  });

  const onSelectCard = useMemoizedFn((items: SearchResult | SearchResult[]) => {
    setSelectorOpen(false);
    if (Array.isArray(items)) {
      // 处理多选的情况
      items.forEach((card) => {
        addTab({
          id: String(card.id),
          type: "card",
          title: getEditorText(card.content, 10),
        });
      });
    } else {
      // 单选情况
      addTab({
        id: String(items.id),
        type: "card",
        title: getEditorText(items.content, 10),
      });
    }
  });

  const onTitleChange = useMemoizedFn((title: string) => {
    updateTab({
      id: String(activeTabKey),
      type: "card",
      title,
    });
  });

  const activeCard = tabs.find(
    (tab) => String(tab.id) === String(activeTabKey),
  );

  return (
    <div className={styles.container}>
      <If condition={tabs.length === 0}>
        <Empty description="暂无卡片" className={styles.empty}>
          <Button onClick={() => setSelectorOpen(true)}>选择卡片</Button>
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
            {activeCard && (
              <CardViewer
                cardId={String(activeCard.id)}
                onTitleChange={onTitleChange}
              />
            )}
          </div>
        </div>
      </If>
      <ContentSelectorModal
        open={selectorOpen}
        onCancel={() => setSelectorOpen(false)}
        onSelect={onSelectCard}
        contentType="card"
        extensions={customExtensions}
        emptyDescription="暂无卡片"
        showTitle={false}
        multiple={true}
      />
    </div>
  );
};

export default CardsViewer;
