import React, { useMemo, useState } from "react";
import { Empty, Button } from "antd";
import { useMemoizedFn } from "ahooks";

import { BaseViewerProps } from "../../../types";
import ProjectItemViewer from "../ProjectItemViewer";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import {
  fileAttachmentExtension,
  contentLinkExtension,
  projectCardListExtension,
  questionCardExtension,
} from "@/editor-extensions";
import TabsIndicator from "@/components/TabsIndicator";

import styles from "./index.module.less";
import If from "@/components/If";
import { SearchResult } from "@/types/search";

const customExtensions = [
  fileAttachmentExtension,
  contentLinkExtension,
  projectCardListExtension,
  questionCardExtension,
];

const ProjectItemsViewer: React.FC<BaseViewerProps> = ({
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
      type: "project-item",
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
      type: "project-item",
      title: "",
    });
  });

  const onSelectProjectItem = useMemoizedFn(
    (items: SearchResult | SearchResult[]) => {
      setSelectorOpen(false);
      if (Array.isArray(items)) {
        // 处理多选的情况
        items.forEach((projectItem) => {
          addTab({
            id: String(projectItem.id),
            type: "project-item",
            title: projectItem.title || "项目",
          });
        });
      } else {
        // 单选情况
        addTab({
          id: String(items.id),
          type: "project-item",
          title: items.title || "项目",
        });
      }
    },
  );

  const activeProjectItem = tabs.find((tab) => String(tab.id) === activeTabKey);

  return (
    <div className={styles.container}>
      <If condition={tabs.length === 0}>
        <Empty description="暂无项目" className={styles.empty}>
          <Button onClick={() => setSelectorOpen(true)}>选择项目</Button>
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
            {activeProjectItem && (
              <ProjectItemViewer
                projectItemId={String(activeProjectItem.id)}
                onTitleChange={(title: string) => {
                  updateTab({
                    id: String(activeProjectItem.id),
                    type: "project-item",
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
        onSelect={onSelectProjectItem}
        contentType="project-item"
        extensions={customExtensions}
        emptyDescription="无结果"
        showTitle={true}
        multiple={true}
      />
    </div>
  );
};

export default ProjectItemsViewer;
