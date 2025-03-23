import React, { useEffect, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { Outlet, Route, Routes } from "react-router-dom";

import Titlebar from "../components/Titlebar";
import Sidebar from "./components/Sidebar";
import CardTitlebar from "./components/Titlebar/CardTitlebar";
import ArticleTitlebar from "./components/Titlebar/ArticleTitlebar";
import WhiteBoardTitlebar from "./components/Titlebar/WhiteBoardTitlebar";
import DocumentTitlebar from "./components/Titlebar/DocumentTitlebar";
import ProjectTitlebar from "./components/Titlebar/ProjectTitlebar";
import RightSidebar from "./components/RightSidebar";
import AISearch from "./components/AISearch";

import useChatMessageStore, { EStatus } from "@/stores/useChatMessageStore.ts";
import useInitDatabase from "@/hooks/useInitDatabase.ts";

import styles from "./index.module.less";
import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";
import isHotkey from "is-hotkey";
import { openMarkdownInNewWindow, selectFile } from "@/commands/file";

const ShortSidebarLayout = () => {
  useInitDatabase();
  const { status } = useChatMessageStore((state) => ({
    status: state.status,
  }));

  const { sidebarOpen } = useGlobalStateStore((state) => ({
    sidebarOpen: state.sidebarOpen,
  }));

  const [containerStyle, setContainerStyle] = useState({
    "--right-sidebar-width": "0px",
    "--sidebar-width": "200px",
  } as React.CSSProperties);

  const onRightSidebarWidthChange = useMemoizedFn((width) => {
    setContainerStyle({
      ...containerStyle,
      "--right-sidebar-width": width + "px",
    } as React.CSSProperties);
  });

  const handleSidebarOpenChange = useMemoizedFn((sidebarOpen: boolean) => {
    setContainerStyle({
      ...containerStyle,
      "--sidebar-width": (sidebarOpen ? 200 : 60) + "px",
    } as React.CSSProperties);
  });

  useEffect(() => {
    handleSidebarOpenChange(sidebarOpen);
  }, [handleSidebarOpenChange, sidebarOpen]);

  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      if (isHotkey("mod+o", event)) {
        event.preventDefault();
        const filePaths = await selectFile({
          properties: ["openFile"],
          filters: [{ name: "Markdown", extensions: ["md"] }],
        });
        if (filePaths && filePaths.length > 0) {
          openMarkdownInNewWindow(filePaths[0]);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className={styles.container} style={containerStyle}>
      <Sidebar className={styles.sidebar} />
      <div className={styles.content}>
        <div className={styles.titlebar}>
          <Routes>
            <Route
              path="/"
              element={
                <Titlebar
                  showColumns={false}
                  showSelectDatabase
                  showFocusMode={false}
                  showSearch
                />
              }
            >
              <Route path={"cards/*"} element={<CardTitlebar />} />
              <Route path="articles/" element={<ArticleTitlebar />} />
              <Route path="white-boards/*" element={<WhiteBoardTitlebar />} />
              <Route path="documents/:id" element={<DocumentTitlebar />} />
              <Route path="projects/:id" element={<ProjectTitlebar />} />
              <Route path="*" element={<div />} />
            </Route>
          </Routes>
        </div>
        <div className={styles.main}>
          <div className={styles.mainContent}>
            <Outlet />
          </div>
          {status === EStatus.SUCCESS && (
            <RightSidebar onWidthChange={onRightSidebarWidthChange} />
          )}
        </div>
      </div>
      <AISearch />
    </div>
  );
};

export default ShortSidebarLayout;
