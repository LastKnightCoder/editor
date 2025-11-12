import { memo } from "react";
import classnames from "classnames";
import { platform } from "@/electron.ts";

import useFullScreen from "@/hooks/useFullScreen.ts";
import styles from "./index.module.less";
import SidebarFooter from "./SidebarFooter";
import SidebarNavItems from "./SidebarNavItems";

const Sidebar = memo(() => {
  const isFullscreen = useFullScreen();
  const isMac = platform === "darwin";

  return (
    <div
      className={classnames(
        "flex-1 min-h-0 m-3 shadow-md rounded-2xl",
        styles.sidebar,
      )}
    >
      <div
        className={classnames(styles.list, {
          [styles.isMac]: isMac && !isFullscreen,
        })}
      >
        <SidebarNavItems isShortWidth={true} />
      </div>

      <SidebarFooter isShortWidth={true} />
    </div>
  );
});

Sidebar.displayName = "Sidebar";

export default Sidebar;
