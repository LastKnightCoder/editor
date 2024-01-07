import { App } from 'antd';
import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import isHotkey from "is-hotkey";

import SettingModal from "./SettingModal";
import TitleBar from "./TitleBar";
import Sidebar from "./Sidebar";
import NavigatePage from "./NavigatePage";

import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";

import styles from './index.module.less';

const Management = () => {
  // 监听快捷键 mod + left 隐藏列表，mod + right 显示列表
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isHotkey('mod+left', e)) {
        useGlobalStateStore.setState({
          sidebarOpen: false,
        })
        e.preventDefault();
      }
      if (isHotkey('mod+right', e)) {
        useGlobalStateStore.setState({
          sidebarOpen: true,
        });
        e.preventDefault();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    }
  }, []);

  return (
    <div className={styles.defaultLayout}>
      <Sidebar className={styles.sidebar} />
      <div className={styles.container}>
        <TitleBar className={styles.titleBar} />
        <div id={'detail-container'} className={styles.detail}>
          <App className={styles.app}>
            <Outlet />
          </App>
        </div>
      </div>
      <SettingModal />
      <NavigatePage />
    </div>
  )
}

export default Management;