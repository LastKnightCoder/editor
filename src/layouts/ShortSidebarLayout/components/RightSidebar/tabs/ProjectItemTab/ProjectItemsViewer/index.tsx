import React, { useMemo, useState } from "react";
import { Empty, Modal, Tabs, Button } from "antd";
import { useMemoizedFn } from "ahooks";

import { BaseViewerProps } from "../../../types";
import ProjectItemViewer from "../ProjectItemViewer";
import ProjectItemSelector from "../ProjectItemSelector";

import styles from "./index.module.less";
import If from "@/components/If";
import { SearchResult } from "@/types/search";

type TargetKey = React.MouseEvent | React.KeyboardEvent | string;

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
        tabs.find((tab) => tab.id === Number(activeKey) || tab.id === activeKey)
          ?.title || "",
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

  const onSelectProjectItem = useMemoizedFn((projectItem: SearchResult) => {
    setSelectorOpen(false);
    addTab({
      id: String(projectItem.id),
      type: "project-item",
      title: projectItem.title || "项目",
    });
  });

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
        <ProjectItemSelector onSelect={onSelectProjectItem} />
      </Modal>
    </div>
  );
};

export default ProjectItemsViewer;
