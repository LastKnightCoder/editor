import WindowControl from "@/components/WindowControl";
import { Routes, Route } from "react-router-dom";

import styles from './index.module.less';

const Titlebar = () => {
  return (
    <div data-tauri-drag-region className={styles.titleBar}>
      <div>
        <Routes>
          <Route path="/cards" element={<div>Cards</div>} />
          <Route path="/articles" element={<div>Articles</div>} />
        </Routes>
      </div>
      <WindowControl className={styles.windowControl} />
    </div>
  )
}

export default Titlebar;