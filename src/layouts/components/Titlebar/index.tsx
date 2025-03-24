import { memo, useState } from "react";
import { Outlet } from "react-router-dom";
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";
import SVG from "react-inlinesvg";

import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";
import useRightSidebarStore from "@/stores/useRightSidebarStore";

import TitlebarIcon from "@/components/TitlebarIcon";
import { platform } from "@/electron.ts";
import { setAlwaysOnTop as setTop } from "@/commands";

import sidebarLeftIcon from "@/assets/icons/sidebar-left.svg";
import sidebarRightIcon from "@/assets/icons/sidebar-right.svg";
import chatIcon from "@/assets/icons/chat.svg";
import { PushpinOutlined } from "@ant-design/icons";

import styles from "./index.module.less";
import useChatMessageStore from "@/stores/useChatMessageStore";

const Titlebar = memo(() => {
  const leftSidebarOpen = useGlobalStateStore((state) => state.sidebarOpen);
  const chatSidebarOpen = useChatMessageStore((state) => state.open);
  const rightSidebarOpen = useRightSidebarStore((state) => state.open);

  const [alwaysOnTop, setAlwaysOnTop] = useState<boolean>(false);

  const toggleAlwaysOnTop = async () => {
    setAlwaysOnTop(!alwaysOnTop);
    await setTop(!alwaysOnTop);
  };

  const handleOpenSidebar = useMemoizedFn(() => {
    useGlobalStateStore.setState({
      sidebarOpen: true,
    });
  });

  const handleOpenChatSidebar = useMemoizedFn(() => {
    if (chatSidebarOpen) {
      useChatMessageStore.setState({
        open: false,
      });
      return;
    }
    if (rightSidebarOpen) {
      useRightSidebarStore.setState({
        open: false,
      });
    }
    setTimeout(() => {
      useChatMessageStore.setState({
        open: true,
      });
    }, 300);
  });

  const handleOpenRightSidebar = useMemoizedFn(() => {
    if (rightSidebarOpen) {
      useRightSidebarStore.setState({
        open: false,
      });
      return;
    }
    if (chatSidebarOpen) {
      useChatMessageStore.setState({
        open: false,
      });
    }
    setTimeout(() => {
      useRightSidebarStore.setState({
        open: true,
      });
    }, 300);
  });

  const isMac = platform === "darwin";

  return (
    <div
      className={classnames(styles.titleBar, {
        [styles.sidebarHide]: isMac && !leftSidebarOpen,
      })}
    >
      {!leftSidebarOpen && (
        <TitlebarIcon onClick={handleOpenSidebar}>
          <SVG src={sidebarLeftIcon} />
        </TitlebarIcon>
      )}
      <Outlet />
      <div className={styles.right}>
        <TitlebarIcon
          tip={alwaysOnTop ? "取消置顶" : "置顶"}
          onClick={toggleAlwaysOnTop}
        >
          <PushpinOutlined
            className={classnames(styles.pin, { [styles.onTop]: alwaysOnTop })}
          />
        </TitlebarIcon>
        <TitlebarIcon
          tip="聊天"
          onClick={handleOpenChatSidebar}
          active={chatSidebarOpen}
        >
          <SVG src={chatIcon} />
        </TitlebarIcon>
        <TitlebarIcon
          tip="右侧栏"
          onClick={handleOpenRightSidebar}
          active={rightSidebarOpen}
        >
          <SVG src={sidebarRightIcon} />
        </TitlebarIcon>
      </div>
    </div>
  );
});

export default Titlebar;
