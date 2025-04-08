import React, { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useMemoizedFn } from "ahooks";

import useRightSidebarStore from "@/stores/useRightSidebarStore";
import { tabRegistry } from "../TabRegistry";
import TabsIndicator from "@/components/TabsIndicator";

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

  const tabItems = useMemo(() => {
    return allTabDefinitions.map((def) => ({
      key: def.type,
      label: (
        <div className={styles.tabLabel}>
          {def.icon && <span className={styles.tabIcon}>{def.icon}</span>}
          <span>{def.title}</span>
        </div>
      ),
    }));
  }, [allTabDefinitions]);

  const handleTabChange = useMemoizedFn((value: string) => {
    setContainerActiveTabKey(value);
  });

  // Find the active tab definition based on current containerActiveTabKey
  const activeDefinition = allTabDefinitions.find(
    (def) => def.type === (containerActiveTabKey || allTabDefinitions[0]?.type),
  );

  const ActiveViewer = activeDefinition?.viewer;

  return (
    <div className={styles.container}>
      <div className={styles.tabsWrapper}>
        <TabsIndicator
          tabs={tabItems}
          activeTab={containerActiveTabKey || allTabDefinitions[0]?.type}
          onChange={handleTabChange}
          className={styles.tabsIndicator}
        />
      </div>

      <div className={styles.tabContent}>
        {!isReady ? (
          <div className={styles.loading}>加载中...</div>
        ) : (
          ActiveViewer && (
            <ActiveViewer
              type={activeDefinition.type.toLowerCase()}
              tabs={tabs[activeDefinition.type.toLowerCase()] || []}
              addTab={addTab}
              removeTab={removeTab}
              updateTab={updateTab}
              setActiveTabKey={setActiveTabKey}
              activeTabKey={activeTabKey[activeDefinition.type.toLowerCase()]}
            />
          )
        )}
      </div>
    </div>
  );
};

export default RightSidebarContent;
