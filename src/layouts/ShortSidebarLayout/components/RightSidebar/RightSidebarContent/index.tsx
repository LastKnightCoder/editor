import React, { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useMemoizedFn } from "ahooks";
import { Tabs } from "antd";

import useRightSidebarStore from "@/stores/useRightSidebarStore";
import { tabRegistry } from "../TabRegistry";

import styles from "./index.module.less";
import useGlobalStateStore from "@/stores/useGlobalStateStore";
import useSettingStore from "@/stores/useSettingStore";

const RightSidebarContent: React.FC = () => {
  const {
    containerActiveTabKey,
    setContainerActiveTabKey,
    addTab,
    removeTab,
    updateTab,
    activeTabKey,
    setActiveTabKey,
    tabs,
  } = useRightSidebarStore(
    useShallow((state) => ({
      containerActiveTabKey: state.containerActiveTabKey,
      setContainerActiveTabKey: state.setContainerActiveTabKey,
      addTab: state.addTab,
      removeTab: state.removeTab,
      updateTab: state.updateTab,
      setActiveTabKey: state.setActiveTabKey,
      activeTabKey: state.activeTabKey,
      tabs: state.tabs,
    })),
  );

  const databaseStatus = useGlobalStateStore((state) => state.databaseStatus);
  const active = useSettingStore((state) => state.setting.database.active);
  const isReady = databaseStatus[active];

  const allTabDefinitions = useMemo(() => {
    return tabRegistry.getAllTabDefinitions();
  }, []);

  const items = useMemo(() => {
    return allTabDefinitions.map((def) => {
      const Viewer = def.viewer;
      return {
        key: def.type,
        label: def.title,
        icon: def.icon,
        children: (
          <Viewer
            type={def.type.toLowerCase()}
            tabs={tabs[def.type.toLowerCase()] || []}
            addTab={addTab}
            removeTab={removeTab}
            updateTab={updateTab}
            setActiveTabKey={setActiveTabKey}
            activeTabKey={activeTabKey[def.type.toLowerCase()]}
          />
        ),
      };
    });
  }, [
    allTabDefinitions,
    tabs,
    addTab,
    removeTab,
    updateTab,
    setActiveTabKey,
    activeTabKey,
  ]);

  const handleTabChange = useMemoizedFn((value: string) => {
    setContainerActiveTabKey(value);
  });

  if (!isReady) {
    <div className={styles.loading}>加载中...</div>;
  }

  return (
    <div className={styles.container}>
      <Tabs
        destroyInactiveTabPane
        items={items}
        activeKey={containerActiveTabKey || allTabDefinitions[0]?.type}
        onChange={handleTabChange}
      />
    </div>
  );
};

export default RightSidebarContent;
