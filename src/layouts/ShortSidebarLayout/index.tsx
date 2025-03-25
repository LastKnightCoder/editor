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

const ShortSidebarLayout = () => {
  useInitDatabase();

  const chatSidebarOpen = useChatMessageStore((state) => state.open);
  const rightSidebarOpen = useRightSidebarStore((state) => state.open);

  return (
    <div className={styles.container}>
      <Sidebar className={styles.sidebar} />
      <div className={styles.content}>
        <div className={styles.mainContent}>
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
