import React, { useMemo, useState } from "react";
import { Empty, Tabs, Button } from "antd";
import { useMemoizedFn } from "ahooks";

import { BaseViewerProps } from "../../../types";
import ProjectItemViewer from "../ProjectItemViewer";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import {
  fileAttachmentExtension,
  cardLinkExtension,
  projectCardListExtension,
} from "@/editor-extensions";

import styles from "./index.module.less";
import If from "@/components/If";
import { SearchResult } from "@/types/search";

type TargetKey = React.MouseEvent | React.KeyboardEvent | string;

const customExtensions = [
  fileAttachmentExtension,
  cardLinkExtension,
  projectCardListExtension,
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

  const tabsItems = useMemo(() => {
    return tabs.map((tab) => {
      return {
        key: String(tab.id),
        label: tab.title,
        children: (
          <ProjectItemViewer
            projectItemId={String(tab.id)}
            onTitleChange={(title: string) => {
              updateTab({
                id: String(tab.id),
                type: "project-item",
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
      type: "project-item",
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
          type: "project-item",
          title: "",
        });
      }
    },
  );

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

  return (
    <div className={styles.container}>
      <If condition={tabs.length === 0}>
        <Empty description="暂无项目" className={styles.empty}>
          <Button onClick={() => setSelectorOpen(true)}>选择项目</Button>
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
