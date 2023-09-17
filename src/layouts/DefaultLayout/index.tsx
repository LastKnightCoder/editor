import { App } from 'antd';
import {useEffect} from "react";
import { Outlet } from "react-router-dom";

import SettingModal from "./SettingModal";
import TitleBar from "./TitleBar";
import Sidebar from "./Sidebar";
import styles from './index.module.less';

import useSyncFont from "./hooks/useSyncFont.ts";
import useSettingStore from "@/stores/useSettingStore.ts";

const Management = () => {
  const {
    initSetting,
  } = useSettingStore(state => ({
    initSetting: state.initSetting,
  }));

  useEffect(() => {
    initSetting();
  }, []);

  useSyncFont();

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
    </div>
  )
}

export default Management;