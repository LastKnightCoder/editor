import React, { memo } from "react";
import { useShallow } from "zustand/react/shallow";
import classnames from "classnames";
import { platform } from "@/electron.ts";

import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";
import useFullScreen from "@/hooks/useFullScreen.ts";
import styles from "./index.module.less";
import SidebarHeader from "./SidebarHeader";
import SidebarNavItems from "./SidebarNavItems";
import SidebarFooter from "./SidebarFooter";
import SearchBox from "./SearchBox";

interface SidebarProps {
  className?: string;
  style?: React.CSSProperties;
}

const Sidebar = memo((props: SidebarProps) => {
  const { className, style } = props;

  const { sidebarOpen } = useGlobalStateStore(
    useShallow((state) => ({
      sidebarOpen: state.sidebarOpen,
    })),
  );

  const isFullscreen = useFullScreen();
  const isMac = platform === "darwin";

  return (
    <div
      style={{
        width: sidebarOpen ? 200 : 60,
        height: "100%",
        boxSizing: "border-box",
        ...style,
      }}
      className={className}
    >
      <div
        className={classnames(styles.sidebar, {
          [styles.isShort]: !sidebarOpen,
        })}
      >
        <SidebarHeader isMac={isMac} isFullscreen={isFullscreen} />
        <div
          className={classnames(styles.list, {
            [styles.isMac]: isMac && !isFullscreen,
          })}
        >
          {sidebarOpen && <SearchBox isMac={isMac} />}
          <SidebarNavItems isShortWidth={!sidebarOpen} />
        </div>
        <SidebarFooter isShortWidth={!sidebarOpen} />
      </div>
    </div>
  );
});

export default Sidebar;
