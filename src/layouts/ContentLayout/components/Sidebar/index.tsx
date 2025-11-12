import React, { memo } from "react";
import classnames from "classnames";
import { platform } from "@/electron.ts";

import useFullScreen from "@/hooks/useFullScreen.ts";
import useTabStore from "@/stores/useTabStore";
import styles from "./index.module.less";
import SidebarFooter from "./SidebarFooter";

interface SidebarProps {
  className?: string;
  style?: React.CSSProperties;
}

const Sidebar = memo((props: SidebarProps) => {
  const { className, style } = props;

  const isFullscreen = useFullScreen();
  const isMac = platform === "darwin";
  const collapsed = useTabStore((state) => state.sidebarCollapsed);

  return (
    <div
      className={classnames(className, styles.sidebarContainer, {
        [styles.collapsed]: collapsed,
      })}
      style={style}
    >
      <div className={classnames(styles.sidebar)}>
        <div
          className={classnames(styles.list, {
            [styles.isMac]: isMac && !isFullscreen,
          })}
        >
          {" "}
        </div>

        <SidebarFooter isShortWidth={collapsed} />
      </div>
    </div>
  );
});

export default Sidebar;
