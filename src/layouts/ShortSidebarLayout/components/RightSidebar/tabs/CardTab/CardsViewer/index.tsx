import React, { useMemo, useState } from "react";
import { Empty, Modal, Tabs, Button } from "antd";
import { useMemoizedFn } from "ahooks";

import { getEditorText } from "@/utils";
import { ICard } from "@/types";

import { BaseViewerProps } from "../../../types";
import CardSelector from "../CardSelector";
import CardViewer from "../CardViewer";

import styles from "./index.module.less";
import If from "@/components/If";

type TargetKey = React.MouseEvent | React.KeyboardEvent | string;

const CardsViewer: React.FC<BaseViewerProps> = ({
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
          <CardViewer
            cardId={String(tab.id)}
            onTitleChange={(title) => {
              updateTab({
                id: String(tab.id),
                type: "card",
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
      type: "card",
      title:
        tabs.find((tab) => Number(tab.id) === Number(activeKey))?.title || "",
    });
  });

  const handleEdit = useMemoizedFn(
    (targetKey: TargetKey, action: "add" | "remove") => {
      if (action === "add") {
        setSelectorOpen(true);
      } else if (action === "remove") {
        console.log(targetKey, typeof targetKey);
        removeTab({
          id: targetKey as string,
          type: "card",
          title: "",
        });
      }
    },
  );

  const onSelectCard = useMemoizedFn((card: ICard) => {
    setSelectorOpen(false);
    addTab({
      id: String(card.id),
      type: "card",
      title: getEditorText(card.content, 10),
    });
  });

  return (
    <div className={styles.container}>
      <If condition={tabs.length === 0}>
        <Empty description="暂无卡片" className={styles.empty}>
          <Button onClick={() => setSelectorOpen(true)}>选择卡片</Button>
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
        <CardSelector onSelect={onSelectCard} />
      </Modal>
    </div>
  );
};

export default CardsViewer;
