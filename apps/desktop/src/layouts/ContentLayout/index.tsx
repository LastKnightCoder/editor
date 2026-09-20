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
import { ToastHost } from "@tau/ui";
import { platform } from "@/platform";

const ShortSidebarLayout = memo(() => {
  useInitDatabase();
  useArticleDeletedCleanup();

  useEffect(() => {
    initAiServer();
  }, []);

  useEffect(() => {
    const handleOpenMarkdown = async (e: any) => {
      // 打开本地 Markdown 依赖系统文件选择与独立窗口，仅桌面平台提供
      if (platform.supports("window.open-markdown") && isHotkey("mod+o", e)) {
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
      <div className={`flex h-screen w-screen flex-col bg-[var(--th-bg-page)] ${styles.container}`}>
        {platform.supports("window.minimize") && <GlobalTitlebar />}

        <div className="flex min-h-0 flex-1 overflow-hidden px-3 pb-3 pt-3">
          <div className={`box-border flex h-full min-w-0 flex-1 flex-col`}>
            <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--th-border)] bg-[var(--th-card-bg)] shadow-lg">
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
        {/* 去 antd 后共享组件的 toast 反馈宿主（useFlashcardCreation/协作控制等） */}
        <ToastHost />
      </div>
    </FullScreenLoading>
  );
});

export default ShortSidebarLayout;
