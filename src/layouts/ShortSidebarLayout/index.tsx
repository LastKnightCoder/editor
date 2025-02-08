import React, { useState } from "react";
import { useMemoizedFn } from "ahooks";
import { Outlet, Route, Routes } from 'react-router-dom';

import Titlebar from '../components/Titlebar';
import SettingModal from "../components/SettingModal";
import Sidebar from './components/Sidebar';
import CardTitlebar from "./components/Titlebar/CardTitlebar";
import ArticleTitlebar from "./components/Titlebar/ArticleTitlebar";
import WhiteBoardTitlebar from "./components/Titlebar/WhiteBoardTitlebar";
import DocumentTitlebar from "./components/Titlebar/DocumentTitlebar";
import ProjectTitlebar from "./components/Titlebar/ProjectTitlebar";
import RightSidebar from "./components/RightSidebar";
import AISearch from "./components/AISearch";

import useChatMessageStore, { EStatus } from "@/stores/useChatMessageStore.ts";
import useInitDatabase from "@/hooks/useInitDatabase.ts";

import styles from './index.module.less';
import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";

const ShortSidebarLayout = () => {
  useInitDatabase();
  const {
    status
  } = useChatMessageStore(state => ({
    status: state.status
  }));
  
  const {
    sidebarOpen
  } = useGlobalStateStore(state => ({
    sidebarOpen: state.sidebarOpen,
  }))

  const [containerStyle, setContainerStyle] = useState({
    '--right-sidebar-width': '0px',
    '--sidebar-width': '200px'
  } as React.CSSProperties);

  const onRightSidebarWidthChange = useMemoizedFn(width => {
    setContainerStyle({
      ...containerStyle,
      '--right-sidebar-width': width + 'px'
    } as React.CSSProperties)
  });
  
  const onSidebarWidthChange = useMemoizedFn(width => {
    setContainerStyle({
      ...containerStyle,
      '--sidebar-width': width + 'px'
    } as React.CSSProperties)
  })

  return (
    <div className={styles.container} style={containerStyle}>
      <Sidebar style={{
        pointerEvents: sidebarOpen ? 'auto' : 'none'
      }} className={styles.sidebar} onWidthChange={onSidebarWidthChange} />
      <div className={styles.content}>
        <div className={styles.titlebar}>
          <Routes>
            <Route path='/' element={<Titlebar showColumns={false} showSelectDatabase showFocusMode={false} showSearch />}>
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
          {
            status === EStatus.SUCCESS && (
              <RightSidebar onWidthChange={onRightSidebarWidthChange} />
            )
          }
        </div>
      </div>
      <SettingModal />
      <AISearch />
    </div>
  )
}

export default ShortSidebarLayout;
