import { Outlet } from "react-router-dom";

import styles from "./index.module.less";
import { PushpinOutlined } from "@ant-design/icons";
import TitlebarIcon from "@/components/TitlebarIcon";
import { useState } from "react";
import classnames from "classnames";
import { setAlwaysOnTop as setTop } from "@/commands";

const Management = () => {
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);

  const toggleAlwaysOnTop = () => {
    setAlwaysOnTop(!alwaysOnTop);
    setTop(!alwaysOnTop);
  };

  return (
    <div className={styles.defaultLayout}>
      <div className={styles.titlebar}>
        <div className={styles.icons}>
          <TitlebarIcon
            tip={alwaysOnTop ? "取消置顶" : "置顶"}
            onClick={toggleAlwaysOnTop}
          >
            <PushpinOutlined
              className={classnames(styles.pin, {
                [styles.onTop]: alwaysOnTop,
              })}
            />
          </TitlebarIcon>
        </div>
      </div>
      <div className={styles.content}>
        <Outlet />
      </div>
    </div>
  );
};

export default Management;
