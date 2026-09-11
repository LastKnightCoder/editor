import { memo } from "react";
import classnames from "classnames";
import { isMac } from "@/platform";

import useFullScreen from "@/hooks/useFullScreen.ts";
import styles from "./index.module.less";
import SidebarFooter from "./SidebarFooter";
import SidebarNavItems from "./SidebarNavItems";

const Sidebar = memo(() => {
  const isFullscreen = useFullScreen();

  return (
    <div className={classnames("m-3 min-h-0 flex-1 rounded-2xl shadow-md", styles.sidebar)}>
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
