import { Outlet } from "react-router-dom";
import classnames from "classnames";

import Sidebar from "./components/Sidebar";
import RightSidebar from "./components/RightSidebar";
import ChatSidebar from "./components/ChatSidebar";
import Search from "./components/Search";

import useInitDatabase from "@/hooks/useInitDatabase.ts";

import useRightSidebarStore from "@/stores/useRightSidebarStore";
import useChatMessageStore from "@/stores/useChatMessageStore";

import styles from "./index.module.less";
import { useMemo } from "react";

const ShortSidebarLayout = () => {
  useInitDatabase();

  const chatSidebarOpen = useChatMessageStore((state) => state.open);
  const rightSidebarOpen = useRightSidebarStore((state) => state.open);

  // 本来不需要计算宽度的，但是不知道为什么 HomeView 会不生效，感觉是 Chrome 的
  const chatWidth = useRightSidebarStore((state) => state.width);
  const rightSidebarWidth = useRightSidebarStore((state) => state.width);
  const mainContentWidth = useMemo(() => {
    return `calc(100% - ${chatWidth}px - ${rightSidebarWidth}px)`;
  }, [chatWidth, rightSidebarWidth]);

  return (
    <div className={styles.container}>
      <Sidebar className={styles.sidebar} />
      <div className={styles.content}>
        <div className={styles.mainContent} style={{ width: mainContentWidth }}>
          <Outlet />
        </div>
        <div
          className={classnames(styles.rightSidebar, {
            [styles.hide]: !chatSidebarOpen && !rightSidebarOpen,
          })}
        >
          <ChatSidebar />
          <RightSidebar />
        </div>
      </div>
      <Search />
    </div>
  );
};

export default ShortSidebarLayout;
