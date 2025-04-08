import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useMemoizedFn, useSize } from "ahooks";
import classnames from "classnames";
import {
  CloseOutlined,
  EllipsisOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { Dropdown } from "antd";
import type { MenuProps } from "antd";

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
  closable?: boolean;
  onClose?: (tabKey: T) => void;
  showAddButton?: boolean;
  onAdd?: () => void;
}

const TabsIndicator = <T extends string = string>({
  tabs,
  activeTab,
  onChange,
  className,
  closable,
  onClose,
  showAddButton,
  onAdd,
}: TabsIndicatorProps<T>) => {
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabsElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [indicatorStyle, setIndicatorStyle] = useState({
    left: 0,
    width: 0,
  });
  const [hiddenTabs, setHiddenTabs] = useState<T[]>([]);
  const prevActiveTabRef = useRef<T>(activeTab);

  const size = useSize(tabsRef);

  const getIndicatorPosition = useCallback((tabKey: string) => {
    const tabElement = tabsElementsRef.current.get(tabKey);
    if (!tabElement || !tabsRef.current) return null;

    return {
      left: tabElement.offsetLeft,
      width: tabElement.offsetWidth,
    };
  }, []);

  useEffect(() => {
    if (prevActiveTabRef.current !== activeTab) {
      prevActiveTabRef.current = activeTab;

      const newPosition = getIndicatorPosition(activeTab as string);
      if (newPosition) {
        setIndicatorStyle(newPosition);
      }

      // Scroll the tab into view
      const tabElement = tabsElementsRef.current.get(activeTab as string);
      const tabsContainer = tabsRef.current;

      if (tabElement && tabsContainer) {
        try {
          const tabRect = tabElement.getBoundingClientRect();
          const containerRect = tabsContainer.getBoundingClientRect();

          const isTabLeftVisible = tabRect.left >= containerRect.left;
          const isTabRightVisible = tabRect.right <= containerRect.right;

          if (!isTabLeftVisible || !isTabRightVisible) {
            const scrollLeft =
              tabElement.offsetLeft -
              containerRect.width / 2 +
              tabRect.width / 2;
            tabsContainer.scrollTo({
              left: scrollLeft,
              behavior: "smooth",
            });
          }
        } catch (error) {
          console.error("Error scrolling tab into view:", error);
        }
      }
    }
  }, [activeTab, getIndicatorPosition]);

  useEffect(() => {
    const newPosition = getIndicatorPosition(activeTab as string);
    if (newPosition) {
      setIndicatorStyle(newPosition);
    }
  }, [size, getIndicatorPosition, activeTab]);

  // Add mouse wheel horizontal scrolling
  useEffect(() => {
    const tabsContainer = tabsRef.current;
    if (!tabsContainer) return;

    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        return;
      }

      e.preventDefault();

      tabsContainer.scrollLeft += e.deltaY;
    };

    tabsContainer.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      tabsContainer.removeEventListener("wheel", handleWheel);
    };
  }, []);

  useEffect(() => {
    if (!tabsRef.current) return;

    const checkHiddenTabs = () => {
      const tabsContainer = tabsRef.current;
      if (!tabsContainer) return;

      try {
        const containerRect = tabsContainer.getBoundingClientRect();
        const containerLeft = containerRect.left;
        const containerRight = containerRect.right;
        const hiddenTabKeys: T[] = [];

        const tabElements = tabsContainer.querySelectorAll(`.${styles.tab}`);

        tabElements.forEach((tabEl, index) => {
          if (index < tabs.length) {
            const tabRect = tabEl.getBoundingClientRect();
            const tabLeft = tabRect.left;
            const tabRight = tabRect.right;

            if (tabRight > containerRight || tabLeft < containerLeft) {
              hiddenTabKeys.push(tabs[index].key);
            }
          }
        });

        setHiddenTabs(hiddenTabKeys);
      } catch (error) {
        console.error("Error checking hidden tabs:", error);
      }
    };

    checkHiddenTabs();

    const resizeObserver = new ResizeObserver(() => {
      checkHiddenTabs();
    });

    resizeObserver.observe(tabsRef.current);

    const tabsContainer = tabsRef.current;
    tabsContainer.addEventListener("scroll", checkHiddenTabs);

    return () => {
      resizeObserver.disconnect();
      tabsContainer.removeEventListener("scroll", checkHiddenTabs);
    };
  }, [tabs, size]);

  const handleTabClick = useMemoizedFn((tabKey: T) => {
    onChange(tabKey);
  });

  const handleCloseClick = useMemoizedFn((e: React.MouseEvent, tabKey: T) => {
    e.stopPropagation();
    onClose?.(tabKey);
  });

  const handleHiddenTabClick = useMemoizedFn(({ key }: { key: string }) => {
    onChange(key as T);
  });

  const setTabRef = useCallback(
    (tabKey: string) => (element: HTMLDivElement | null) => {
      if (element) {
        tabsElementsRef.current.set(tabKey, element);
      }
    },
    [],
  );

  const dropdownItems: MenuProps["items"] = hiddenTabs
    .map((tabKey) => {
      const tab = tabs.find((t) => t.key === tabKey);
      if (!tab) return null;

      return {
        key: tabKey,
        label: <span>{tab.label}</span>,
      };
    })
    .filter(Boolean);

  return (
    <div className={classnames(styles.tabsContainer, className)}>
      <div className={styles.tabs} ref={tabsRef}>
        {tabs.map((tab) => (
          <div
            key={tab.key}
            ref={setTabRef(tab.key as string)}
            className={classnames(styles.tab, {
              [styles.active]: activeTab === tab.key,
            })}
            onClick={() => handleTabClick(tab.key)}
          >
            {tab.label}
            {closable && (
              <div
                className={styles.closeIcon}
                onClick={(e) => handleCloseClick(e, tab.key)}
              >
                <CloseOutlined className={styles.icon} />
              </div>
            )}
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

      <div className={styles.actionsContainer}>
        {hiddenTabs.length > 0 && (
          <Dropdown
            menu={{
              items: dropdownItems,
              onClick: handleHiddenTabClick,
            }}
            placement="bottomRight"
            trigger={["hover"]}
          >
            <div className={styles.moreButton}>
              <EllipsisOutlined className={styles.icon} />
            </div>
          </Dropdown>
        )}

        {showAddButton && (
          <div className={styles.addButton} onClick={onAdd}>
            <PlusOutlined className={styles.icon} />
          </div>
        )}
      </div>
    </div>
  );
};

export default TabsIndicator;
