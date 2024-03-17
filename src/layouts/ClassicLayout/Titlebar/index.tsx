import { memo } from 'react';
import WindowControl from "@/components/WindowControl";
import { Outlet } from "react-router-dom";

import styles from './index.module.less';

const Titlebar = memo(() => {
  return (
    <div data-tauri-drag-region className={styles.titleBar}>
      <Outlet />
      <WindowControl className={styles.windowControl} />
    </div>
  )
});

export default Titlebar;