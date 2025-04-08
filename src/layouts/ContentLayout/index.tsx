import { useEffect, useMemo, memo } from "react";
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

  // 本来不需要计算宽度的，但是不知道为什么 HomeView 会不生效，感觉是 Chrome 的
  const chatWidth = useRightSidebarStore((state) => state.width);
  const rightSidebarWidth = useRightSidebarStore((state) => state.width);
  const smallComponentSidebarWidth = useSmallComponentSidebarStore(
    (state) => state.width,
  );
  const mainContentWidth = useMemo(() => {
    return `calc(100% - ${chatWidth}px - ${rightSidebarWidth}px - ${smallComponentSidebarWidth}px)`;
  }, [chatWidth, rightSidebarWidth, smallComponentSidebarWidth]);

  return (
    <div className={styles.container}>
      <Sidebar className={styles.sidebar} />
      <div className={styles.content}>
        <div className={styles.mainContent} style={{ width: mainContentWidth }}>
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
    </div>
  );
});

export default ShortSidebarLayout;
