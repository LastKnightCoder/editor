import { memo, useRef, useState } from "react";
import { Outlet } from "react-router-dom";
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";

import WindowControl from "@/components/WindowControl";
import PortalToBody from "@/components/PortalToBody";
import If from "@/components/If";
import { CloseOutlined } from "@ant-design/icons";
import SVG from "react-inlinesvg";
import { useShallow } from "zustand/react/shallow";
import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";

import TitlebarIcon from "@/components/TitlebarIcon";
import { platform } from "@/electron.ts";
import sidebarLeftIcon from "@/assets/icons/sidebar-left.svg";

import styles from "./index.module.less";

interface TitlebarProps {
  showColumns?: boolean;
  showSelectDatabase?: boolean;
  showFocusMode?: boolean;
  showSearch?: boolean;
}

const Titlebar = memo((props: TitlebarProps) => {
  const { showColumns, showSelectDatabase, showFocusMode, showSearch } = props;
  const { sidebarOpen, focusMode } = useGlobalStateStore(
    useShallow((state) => ({
      sidebarOpen: state.sidebarOpen,
      focusMode: state.focusMode,
    })),
  );

  const timer = useRef<number>();

  const [showQuitFocus, setShowQuitFocus] = useState(false);

  const onMouseEnter = useMemoizedFn(() => {
    if (!focusMode) return;
    if (timer) {
      clearTimeout(timer.current);
    }
    setShowQuitFocus(true);
    timer.current = setTimeout(() => {
      setShowQuitFocus(false);
    }, 3000) as any;
  });

  const onMouseLeave = useMemoizedFn(() => {
    if (!focusMode) return;
    if (timer) {
      clearTimeout(timer.current);
    }
    setShowQuitFocus(false);
  });

  const handleQuitFocus = useMemoizedFn(() => {
    useGlobalStateStore.setState({
      focusMode: false,
    });
    setShowQuitFocus(false);
    if (timer) {
      clearTimeout(timer.current);
    }
  });

  const handleOpenSidebar = useMemoizedFn(() => {
    useGlobalStateStore.setState({
      sidebarOpen: true,
    });
  });

  const isMac = platform === "darwin";

  return (
    <div
      className={classnames(styles.titleBar, {
        [styles.sidebarHide]: isMac && !sidebarOpen,
      })}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {!sidebarOpen && (
        <TitlebarIcon onClick={handleOpenSidebar}>
          <SVG src={sidebarLeftIcon} />
        </TitlebarIcon>
      )}
      <If condition={focusMode}>
        <PortalToBody>
          <div
            className={classnames(styles.quitFocus, {
              [styles.show]: showQuitFocus,
            })}
          >
            <div className={styles.quitIcon} onClick={handleQuitFocus}>
              <CloseOutlined
                style={{
                  fontSize: 20,
                }}
              />
            </div>
          </div>
        </PortalToBody>
      </If>
      <If condition={!focusMode}>
        <Outlet />
      </If>
      <WindowControl
        className={styles.windowControl}
        showColumns={showColumns}
        showSelectDatabase={showSelectDatabase}
        showFocusMode={showFocusMode}
        showRightSidebar={true}
        showSearch={showSearch}
      />
    </div>
  );
});

export default Titlebar;
