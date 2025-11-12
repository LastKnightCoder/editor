import { memo, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { useShallow } from "zustand/react/shallow";
import classnames from "classnames";
import SVG from "react-inlinesvg";
import { CloseOutlined, PlusOutlined } from "@ant-design/icons";
import { PushpinOutlined } from "@ant-design/icons";

import useRightSidebarStore from "@/stores/useRightSidebarStore";
import useChatMessageStore from "@/stores/useChatMessageStore";
import useSmallComponentSidebarStore from "@/stores/useSmallComponentSidebar";
import useTabStore from "@/stores/useTabStore";
import useSettingStore from "@/stores/useSettingStore";
import useCommandPanelStore from "@/stores/useCommandPanelStore";

import TitlebarIcon from "@/components/TitlebarIcon";
import { setAlwaysOnTop as setTop } from "@/commands";

import sidebarRightIcon from "@/assets/icons/sidebar-right.svg";
import chatIcon from "@/assets/icons/chat.svg";
import smallComponentIcon from "@/assets/icons/small-components.svg";
import settingIcon from "@/assets/icons/setting.svg";
import sunIcon from "@/assets/icons/sun.svg";
import moonIcon from "@/assets/icons/moon.svg";
import searchIcon from "@/assets/icons/search.svg";
import { TabType } from "@/types/tab";

import styles from "./index.module.less";

interface TitlebarWithTabsProps {
  paneId: string;
  className?: string;
}

const TitlebarWithTabs = memo((props: TitlebarWithTabsProps) => {
  const { paneId, className } = props;
  const chatSidebarOpen = useChatMessageStore((state) => state.open);
  const rightSidebarOpen = useRightSidebarStore((state) => state.open);
  const smallComponentSidebarOpen = useSmallComponentSidebarStore(
    (state) => state.open,
  );

  const panes = useTabStore((state) => state.panes);
  const createTab = useTabStore((state) => state.createTab);
  const closeTab = useTabStore((state) => state.closeTab);
  const switchTab = useTabStore((state) => state.switchTab);

  const [alwaysOnTop, setAlwaysOnTop] = useState<boolean>(false);

  const pane = panes.find((p) => p.id === paneId);

  const toggleAlwaysOnTop = async () => {
    setAlwaysOnTop(!alwaysOnTop);
    await setTop(!alwaysOnTop);
  };

  const handleOpenChatSidebar = useMemoizedFn(() => {
    if (chatSidebarOpen) {
      useChatMessageStore.setState({
        open: false,
      });
      return;
    }
    useRightSidebarStore.setState({
      open: false,
    });
    useSmallComponentSidebarStore.setState({
      open: false,
    });
    useChatMessageStore.setState({
      open: true,
    });
  });

  const handleOpenRightSidebar = useMemoizedFn(() => {
    if (rightSidebarOpen) {
      useRightSidebarStore.setState({
        open: false,
      });
      return;
    }
    useChatMessageStore.setState({
      open: false,
    });
    useSmallComponentSidebarStore.setState({
      open: false,
    });
    useRightSidebarStore.setState({
      open: true,
    });
  });

  const handleOpenSmallComponentSidebar = useMemoizedFn(() => {
    if (smallComponentSidebarOpen) {
      useSmallComponentSidebarStore.setState({
        open: false,
      });
      return;
    }
    useChatMessageStore.setState({
      open: false,
    });
    useRightSidebarStore.setState({
      open: false,
    });
    useSmallComponentSidebarStore.setState({
      open: true,
    });
  });

  const handleNewTab = useMemoizedFn(() => {
    createTab(TabType.Home, undefined, paneId);
  });

  const handleCloseTab = useMemoizedFn((tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    closeTab(paneId, tabId);
  });

  const handleSwitchTab = useMemoizedFn((tabId: string) => {
    switchTab(paneId, tabId);
  });

  const { darkMode, onDarkModeChange } = useSettingStore(
    useShallow((state) => ({
      darkMode: state.setting.darkMode,
      onDarkModeChange: state.onDarkModeChange,
    })),
  );

  const handleToggleTheme = useMemoizedFn(() => {
    onDarkModeChange(!darkMode);
  });

  const handleOpenSettings = useMemoizedFn(() => {
    useSettingStore.setState({
      settingModalOpen: true,
    });
  });

  const handleOpenSearch = useMemoizedFn(() => {
    useCommandPanelStore.setState({
      open: true,
    });
  });

  if (!pane) return null;

  return (
    <div className={classnames(styles.titlebar, className)}>
      <div className={styles.tabs}>
        {pane.tabs.map((tab) => (
          <div
            key={tab.id}
            className={classnames(styles.tab, {
              [styles.active]: tab.id === pane.activeTabId,
            })}
            onClick={() => handleSwitchTab(tab.id)}
          >
            <span className={styles.tabTitle}>{tab.title}</span>
            {tab.closable !== false && (
              <button
                className={styles.closeBtn}
                onClick={(e) => handleCloseTab(tab.id, e)}
              >
                <CloseOutlined />
              </button>
            )}
          </div>
        ))}
        <button className={styles.newTabBtn} onClick={handleNewTab}>
          <PlusOutlined />
        </button>
      </div>

      <div className={styles.right}>
        <TitlebarIcon tip="搜索 (Ctrl+P)" onClick={handleOpenSearch}>
          <SVG src={searchIcon} />
        </TitlebarIcon>
        <TitlebarIcon
          tip={darkMode ? "切换到浅色主题" : "切换到深色主题"}
          onClick={handleToggleTheme}
        >
          <SVG src={darkMode ? sunIcon : moonIcon} />
        </TitlebarIcon>
        <TitlebarIcon tip="设置" onClick={handleOpenSettings}>
          <SVG src={settingIcon} />
        </TitlebarIcon>
        <div className={styles.divider} />
        <TitlebarIcon
          tip={alwaysOnTop ? "取消置顶" : "置顶"}
          onClick={toggleAlwaysOnTop}
        >
          <PushpinOutlined
            className={classnames(styles.pin, { [styles.onTop]: alwaysOnTop })}
          />
        </TitlebarIcon>
        <TitlebarIcon
          tip="小组件"
          onClick={handleOpenSmallComponentSidebar}
          active={smallComponentSidebarOpen}
        >
          <SVG src={smallComponentIcon} />
        </TitlebarIcon>
        <TitlebarIcon
          tip="聊天"
          onClick={handleOpenChatSidebar}
          active={chatSidebarOpen}
        >
          <SVG src={chatIcon} />
        </TitlebarIcon>
        <TitlebarIcon
          tip="右侧栏"
          onClick={handleOpenRightSidebar}
          active={rightSidebarOpen}
          placement="left"
        >
          <SVG src={sidebarRightIcon} />
        </TitlebarIcon>
      </div>
    </div>
  );
});

export default TitlebarWithTabs;
