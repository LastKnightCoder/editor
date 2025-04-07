import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useMemoizedFn, useSize } from "ahooks";
import classnames from "classnames";

import styles from "./index.module.less";

export interface TabItem<T extends string = string> {
  key: T;
  label: React.ReactNode;
}

export interface TabsIndicatorProps<T extends string = string> {
  tabs: TabItem<T>[];
  activeTab: T;
  onChange: (tabKey: T) => void;
  className?: string;
}

const TabsIndicator = <T extends string = string>({
  tabs,
  activeTab,
  onChange,
  className,
}: TabsIndicatorProps<T>) => {
  const tabsRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({
    left: 0,
    width: 0,
  });

  const size = useSize(tabsRef);

  const updateIndicatorPosition = useMemoizedFn(() => {
    if (!activeTabRef.current || !tabsRef.current) return;

    const activeTabElement = activeTabRef.current;
    setIndicatorStyle({
      left: activeTabElement.offsetLeft,
      width: activeTabElement.offsetWidth,
    });
  });

  // Update position when active tab changes
  useEffect(() => {
    updateIndicatorPosition();
  }, [activeTab, updateIndicatorPosition]);

  // Update position when container size changes
  useEffect(() => {
    updateIndicatorPosition();
  }, [size, updateIndicatorPosition]);

  const handleTabClick = useMemoizedFn((tabKey: T) => {
    onChange(tabKey);
  });

  return (
    <div className={classnames(styles.tabsContainer, className)}>
      <div className={styles.tabs} ref={tabsRef}>
        {tabs.map((tab) => (
          <div
            key={tab.key}
            ref={activeTab === tab.key ? activeTabRef : null}
            className={classnames(styles.tab, {
              [styles.active]: activeTab === tab.key,
            })}
            onClick={() => handleTabClick(tab.key)}
          >
            {tab.label}
          </div>
        ))}
        <motion.div
          className={styles.tabIndicator}
          initial={false}
          animate={{
            left: indicatorStyle.left,
            width: indicatorStyle.width,
          }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        />
      </div>
    </div>
  );
};

export default TabsIndicator;
