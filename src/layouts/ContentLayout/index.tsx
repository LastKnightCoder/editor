import { useEffect, memo } from "react";
import isHotkey from "is-hotkey";
import PanesLayout from "./components/PanesLayout";

import Search from "./components/Search";
import CommandPanel from "@/components/CommandPanel";

import useInitDatabase from "@/hooks/useInitDatabase.ts";

import { openMarkdownInNewWindow, selectFile } from "@/commands";

import styles from "./index.module.less";
import SettingModal from "./components/SettingModal";
import Sidebar from "./components/Sidebar";

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
    <div className={`w-[100vw] h-[100vh] flex ${styles.container}`}>
      <div className="flex-shrink-0 w-[100px] h-full flex flex-col">
        <Sidebar />
      </div>
      <div className={`flex-1 min-w-0 h-full box-border flex flex-col`}>
        <div className="flex-1 min-h-0 my-3 mr-3 shadow-md flex overflow-hidden rounded-2xl rounded-xl bg-[var(--main-bg-color)]">
          <div className={styles.mainContent}>
            <PanesLayout />
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
