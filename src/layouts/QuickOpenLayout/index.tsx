import { Outlet } from "react-router-dom";

import styles from "./index.module.less";

const Management = () => {
  return (
    <div className={styles.defaultLayout}>
      <Outlet />
    </div>
  );
};

export default Management;
