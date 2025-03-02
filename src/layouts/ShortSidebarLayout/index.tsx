import React, { useEffect, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { Outlet } from 'react-router-dom';

import SettingModal from "../components/SettingModal";
import Sidebar from './components/Sidebar';
import RightSidebar from "./components/RightSidebar";
import AISearch from "./components/AISearch";

import useInitDatabase from "@/hooks/useInitDatabase.ts";

import styles from './index.module.less';
import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";

const ShortSidebarLayout = () => {
  useInitDatabase();
  
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
  
  const handleSidebarOpenChange = useMemoizedFn((sidebarOpen: boolean) => {
    setContainerStyle({
      ...containerStyle,
      '--sidebar-width': (sidebarOpen ? 200 : 60) + 'px'
    } as React.CSSProperties)
  })

  useEffect(() => {
    handleSidebarOpenChange(sidebarOpen);
  }, [handleSidebarOpenChange, sidebarOpen]);

  return (
    <div className={styles.container} style={containerStyle}>
      <Sidebar
        className={styles.sidebar}
      />
      <div className={styles.content}>
        <div className={styles.main}>
          <Outlet/>
        </div>
      </div>
      <div className={styles.rightSidebar}>
        <RightSidebar
          onWidthChange={onRightSidebarWidthChange}
        />
      </div>
      <SettingModal/>
      <AISearch/>
    </div>
  )
}

export default ShortSidebarLayout;
