import { useEffect, memo } from "react";
import isHotkey from "is-hotkey";
import PanesLayout from "./components/PanesLayout";

import Search from "./components/Search";
import CommandPanel from "@/components/CommandPanel";

import useInitDatabase from "@/hooks/useInitDatabase.ts";

import { openMarkdownInNewWindow, selectFile } from "@/commands";

import styles from "./index.module.less";
import SettingModal from "./components/SettingModal";
import GlobalTitlebar from "./components/GlobalTitlebar";

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

  return (
    <div className={`w-[100vw] h-[100vh] flex flex-col ${styles.container}`}>
      {/* 新增：全局 Titlebar */}
      <GlobalTitlebar />

      {/* 内容区域 */}
      <div className="flex-1 min-h-0 flex">
        <div className={`flex-1 min-w-0 h-full box-border flex flex-col`}>
          <div className="flex-1 min-h-0 mt-3 mx-3 mb-3 shadow-lg flex overflow-hidden rounded-2xl bg-[var(--main-bg-color)] border border-[var(--line-color)]">
            <div className={styles.mainContent}>
              <PanesLayout />
            </div>
          </div>
        </div>
      </div>

      <Search />
      <SettingModal />
      <CommandPanel />
    </div>
  );
});

export default ShortSidebarLayout;
