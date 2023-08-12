import { Outlet } from "react-router-dom";

import SettingModal from "./SettingModal";
import TitleBar from "./TitleBar";
import Sidebar from "./Sidebar";
import styles from './index.module.less';

const Management = () => {
  return (
    <div className={styles.defaultLayout}>
      <Sidebar className={styles.sidebar} />
      <div className={styles.container}>
        <TitleBar className={styles.titleBar} />
        <div id={'detail-container'} className={styles.detail}>
          <Outlet />
        </div>
      </div>
      <SettingModal />
    </div>
  )
}

export default Management;