import { useEffect, memo } from "react";
import isHotkey from "is-hotkey";
import PanesLayout from "./components/PanesLayout";
import RightChatSidebar from "./components/RightChatSidebar";
import RightComponentsSidebar from "./components/RightComponentsSidebar";

import Search from "./components/Search";
import CommandPanel from "@/components/CommandPanel";

import useInitDatabase from "@/hooks/useInitDatabase.ts";
import useArticleDeletedCleanup from "@/hooks/useArticleDeletedCleanup";

import { openMarkdownInNewWindow, selectFile } from "@/commands";

import styles from "./index.module.less";
import SettingModal from "./components/SettingModal";
import GlobalTitlebar from "./components/GlobalTitlebar";
import FullScreenLoading from "@/components/FullScreenLoading";
import { initAiServer } from "@/services/aiServer";

const ShortSidebarLayout = memo(() => {
  useInitDatabase();
  useArticleDeletedCleanup();

  useEffect(() => {
    initAiServer();
  }, []);

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

  return (
    <FullScreenLoading windowType="main">
      <div
        className={`w-screen h-screen flex flex-col bg-[var(--th-bg-page)] ${styles.container}`}
      >
        <GlobalTitlebar />

        <div className="flex-1 min-h-0 flex px-3 pb-3 pt-3 overflow-hidden">
          <div className={`flex-1 min-w-0 h-full box-border flex flex-col`}>
            <div className="flex-1 min-h-0 shadow-lg flex overflow-hidden rounded-2xl border bg-[var(--th-card-bg)] border-[var(--th-border)]">
              <div className={styles.mainContent}>
                <PanesLayout />
              </div>
            </div>
          </div>
          <RightComponentsSidebar />
          <RightChatSidebar />
        </div>

        <Search />
        <SettingModal />
        <CommandPanel />
      </div>
    </FullScreenLoading>
  );
});

export default ShortSidebarLayout;
