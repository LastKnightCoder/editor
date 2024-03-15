import SVG from 'react-inlinesvg';
import WindowControl from "@/components/WindowControl";

import leftSidebar from '@/assets/icons/left-sidebar.svg';

import styles from './index.module.less';

const Titlebar = () => {
  return (
    <div data-tauri-drag-region className={styles.titleBar}>
      <SVG src={leftSidebar} className={styles.sidebar} />
      <WindowControl className={styles.windowControl} />
    </div>
  )
}

export default Titlebar;