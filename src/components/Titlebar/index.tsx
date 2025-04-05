import { memo, useState } from "react";
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";
import SVG from "react-inlinesvg";

import useRightSidebarStore from "@/stores/useRightSidebarStore";

import TitlebarIcon from "@/components/TitlebarIcon";
import { setAlwaysOnTop as setTop } from "@/commands";

import sidebarRightIcon from "@/assets/icons/sidebar-right.svg";
import chatIcon from "@/assets/icons/chat.svg";
import { PushpinOutlined } from "@ant-design/icons";

import styles from "./index.module.less";
import useChatMessageStore from "@/stores/useChatMessageStore";

interface TitlebarProps {
  children: React.ReactNode;
  className?: string;
}

const Titlebar = memo((props: TitlebarProps) => {
  const { children, className } = props;
  const chatSidebarOpen = useChatMessageStore((state) => state.open);
  const rightSidebarOpen = useRightSidebarStore((state) => state.open);

  const [alwaysOnTop, setAlwaysOnTop] = useState<boolean>(false);

  const toggleAlwaysOnTop = async () => {
    setAlwaysOnTop(!alwaysOnTop);
    await setTop(!alwaysOnTop);
  };

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
    useChatMessageStore.setState({
      open: true,
    });
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
    useRightSidebarStore.setState({
      open: true,
    });
  });

  return (
    <div className={classnames(styles.titleBar, className)}>
      {children}
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
