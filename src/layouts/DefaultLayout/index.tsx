import { App } from 'antd';
import { useEffect } from "react";
import { Outlet } from "react-router-dom";

import SettingModal from "./SettingModal";
import TitleBar from "./TitleBar";
import Sidebar from "./Sidebar";
import NavigatePage from "./NavigatePage";
import styles from './index.module.less';

import useSyncFont from "./hooks/useSyncFont.ts";
import useSettingStore from "@/stores/useSettingStore.ts";
import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";
import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";
import useDocumentsStore from "@/stores/useDocumentsStore.ts";


const Management = () => {
  const {
    initSetting,
  } = useSettingStore(state => ({
    initSetting: state.initSetting,
  }));

  const {
    initArticles
  } = useArticleManagementStore(state => ({
    initArticles: state.init
  }));

  const {
    initCards,
  } = useCardsManagementStore((state) => ({
    initCards: state.init,
  }));

  const {
    initDocuments,
  } = useDocumentsStore(state => ({
    initDocuments: state.init,
  }));

  useEffect(() => {
    initSetting();
    initArticles().then();
    initCards().then();
    initDocuments().then();
  }, [initSetting, initArticles, initCards, initDocuments]);

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
      <NavigatePage />
    </div>
  )
}

export default Management;