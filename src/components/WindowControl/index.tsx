import React, { useState } from "react";
import classnames from "classnames";

import FocusMode from "../FocusMode";
import SVG from "react-inlinesvg";
import { Popover } from "antd";
import { PushpinOutlined } from "@ant-design/icons";
import { TbColumns3, TbColumns2, TbColumns1 } from "react-icons/tb";
import TitlebarIcon from "@/components/TitlebarIcon";

import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";

import { setAlwaysOnTop as setTop } from "@/commands";
import sidebarRightIcon from "@/assets/icons/sidebar-right.svg";

import styles from "./index.module.less";

interface IWindowControlProps {
  className?: string;
  style?: React.CSSProperties;
  notShowFullscreen?: boolean;
  initAlwaysOnTop?: boolean;
  showColumns?: boolean;
  showSelectDatabase?: boolean;
  showFocusMode?: boolean;
  showRightSidebar?: boolean;
  showSearch?: boolean;
}

const WindowControl = (props: IWindowControlProps) => {
  const {
    className,
    style,
    initAlwaysOnTop = false,
    showColumns = false,
    showFocusMode = false,
    showRightSidebar = false,
  } = props;

  const [alwaysOnTop, setAlwaysOnTop] = useState<boolean>(initAlwaysOnTop);

  const { listOpen, sidebarOpen } = useGlobalStateStore((state) => ({
    listOpen: state.listOpen,
    sidebarOpen: state.sidebarOpen,
  }));

  const onClickColumnIcon = () => {
    if (listOpen && sidebarOpen) {
      useGlobalStateStore.setState({
        listOpen: false,
      });
    }
    if (sidebarOpen && !listOpen) {
      useGlobalStateStore.setState({
        sidebarOpen: false,
      });
    }
    if (!listOpen && !sidebarOpen) {
      useGlobalStateStore.setState({
        listOpen: true,
        sidebarOpen: true,
      });
    }
  };

  const toggleAlwaysOnTop = async () => {
    setAlwaysOnTop(!alwaysOnTop);
    await setTop(!alwaysOnTop);
  };

  return (
    <div className={classnames(styles.windowControl, className)} style={style}>
      {showColumns && (
        <Popover
          trigger={"hover"}
          styles={{
            body: {
              padding: 4,
            },
          }}
          content={
            <div className={styles.columns}>
              <div
                className={styles.column}
                onClick={() => {
                  useGlobalStateStore.setState({
                    listOpen: false,
                    sidebarOpen: false,
                  });
                }}
              >
                <TbColumns1 className={styles.icon} />
                <div>编辑器视图</div>
              </div>
              <div
                className={styles.column}
                onClick={() => {
                  useGlobalStateStore.setState({
                    listOpen: true,
                    sidebarOpen: false,
                  });
                }}
              >
                <TbColumns2 className={styles.icon} />
                <div>笔记视图</div>
              </div>
              <div
                className={styles.column}
                onClick={() => {
                  useGlobalStateStore.setState({
                    listOpen: true,
                    sidebarOpen: true,
                  });
                }}
              >
                <TbColumns3 className={styles.icon} />
                <div>笔记本视图</div>
              </div>
            </div>
          }
        >
          <div className={styles.item} onClick={onClickColumnIcon}>
            <TbColumns2 />
          </div>
        </Popover>
      )}
      {showFocusMode && <FocusMode />}
      <TitlebarIcon
        tip={alwaysOnTop ? "取消置顶" : "置顶"}
        onClick={toggleAlwaysOnTop}
      >
        <PushpinOutlined
          className={classnames(styles.pin, { [styles.onTop]: alwaysOnTop })}
        />
      </TitlebarIcon>
      {showRightSidebar && (
        <TitlebarIcon
          onClick={() => {
            useGlobalStateStore.setState((state) => {
              return {
                rightSidebarOpen: !state.rightSidebarOpen,
              };
            });
          }}
        >
          <SVG src={sidebarRightIcon} />
        </TitlebarIcon>
      )}
    </div>
  );
};

export default WindowControl;
