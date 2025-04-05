import React, { memo } from "react";
import classnames from "classnames";
import { platform } from "@/electron.ts";

import useFullScreen from "@/hooks/useFullScreen.ts";
import styles from "./index.module.less";
import SidebarNavItems from "./SidebarNavItems";
import SidebarFooter from "./SidebarFooter";

interface SidebarProps {
  className?: string;
  style?: React.CSSProperties;
}

const Sidebar = memo((props: SidebarProps) => {
  const { className, style } = props;

  const isFullscreen = useFullScreen();
  const isMac = platform === "darwin";

  return (
    <div className={className} style={style}>
      <div className={classnames(styles.sidebar)}>
        <div
          className={classnames(styles.list, {
            [styles.isMac]: isMac && !isFullscreen,
          })}
        >
          <SidebarNavItems isShortWidth={true} />
        </div>

        <SidebarFooter isShortWidth={true} />
      </div>
    </div>
  );
});

export default Sidebar;
