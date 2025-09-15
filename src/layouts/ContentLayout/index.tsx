import { useEffect, memo } from "react";
import isHotkey from "is-hotkey";
import { Outlet } from "react-router-dom";
import classnames from "classnames";

import Sidebar from "./components/Sidebar";
import RightSidebar from "./components/RightSidebar";
import ChatSidebar from "./components/ChatSidebar";
import SmallComponentSidebar from "./components/SmallComponentSidebar";

import Search from "./components/Search";

import useInitDatabase from "@/hooks/useInitDatabase.ts";

import useRightSidebarStore from "@/stores/useRightSidebarStore";
import useChatMessageStore from "@/stores/useChatMessageStore";

import { openMarkdownInNewWindow, selectFile } from "@/commands";

import styles from "./index.module.less";
import useSmallComponentSidebarStore from "@/stores/useSmallComponentSidebar";
import SettingModal from "./components/SettingModal";

const ShortSidebarLayout = memo(() => {
  useInitDatabase();

  useEffect(() => {
    const handleOpenMarkdown = async (e: any) => {
      if (isHotkey("mod+o", e)) {
        e.preventDefault();
        e.stopPropagation();
        const filePaths = await selectFile({
          properties: ["openFile"],
          filters: [{ name: "Markdown", extensions: ["md"] }],
        });
        if (!filePaths) return;
        await openMarkdownInNewWindow(filePaths[0]);
      }
    };
    window.addEventListener("keydown", handleOpenMarkdown);
    return () => {
      window.removeEventListener("keydown", handleOpenMarkdown);
    };
  }, []);

  const chatSidebarOpen = useChatMessageStore((state) => state.open);
  const rightSidebarOpen = useRightSidebarStore((state) => state.open);
  const smallComponentSidebarOpen = useSmallComponentSidebarStore(
    (state) => state.open,
  );

  return (
    <div className={styles.container}>
      <Sidebar className={styles.sidebar} />
      <div className={styles.content}>
        <div className={styles.mainContent}>
          <Outlet />
        </div>
        <div
          className={classnames(styles.rightSidebar, {
            [styles.hide]:
              !chatSidebarOpen &&
              !rightSidebarOpen &&
              !smallComponentSidebarOpen,
          })}
        >
          <SmallComponentSidebar />
          <ChatSidebar />
          <RightSidebar />
        </div>
      </div>
      <Search />
      <SettingModal />
    </div>
  );
});

export default ShortSidebarLayout;
