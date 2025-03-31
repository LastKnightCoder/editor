import { Outlet, useSearchParams } from "react-router-dom";

import styles from "./index.module.less";
import { PushpinOutlined } from "@ant-design/icons";
import TitlebarIcon from "@/components/TitlebarIcon";
import { useState } from "react";
import classnames from "classnames";
import { setAlwaysOnTop as setTop } from "@/commands";
import { platform } from "@/electron";

interface QuickOpenLayoutProps {
  title?: string;
}

const QuickOpenLayout = ({ title }: QuickOpenLayoutProps) => {
  const [searchParams] = useSearchParams();
  const isMac = platform === "darwin";
  const showTitlebar = isMac || searchParams.get("showTitlebar") === "true";
  const isDefaultTop = searchParams.get("isDefaultTop") === "true";

  const [alwaysOnTop, setAlwaysOnTop] = useState(isDefaultTop);

  const toggleAlwaysOnTop = () => {
    setAlwaysOnTop(!alwaysOnTop);
    setTop(!alwaysOnTop);
  };

  return (
    <div className={styles.defaultLayout}>
      {showTitlebar && (
        <div className={styles.titlebar}>
          {title && <div className={classnames(styles.title)}>{title}</div>}
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
      )}
      <div className={styles.content}>
        <Outlet />
      </div>
    </div>
  );
};

export default QuickOpenLayout;
