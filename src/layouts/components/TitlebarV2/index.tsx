import React, { memo, useState } from 'react';
import classnames from "classnames";

import { PushpinOutlined } from "@ant-design/icons";

import { Flex } from "antd";
import { setAlwaysOnTop as setTop } from "@/commands";
import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";
import { FiSidebar } from "react-icons/fi";
import styles from './index.module.less';
import TitlebarIcon from "@/components/TitlebarIcon";

interface TitlebarProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  initAlwaysOnTop?: boolean;
}

const Titlebar = memo((props: TitlebarProps) => {
  const { children, className, style, initAlwaysOnTop = false } = props;

  const [alwaysOnTop, setAlwaysOnTop] = useState<boolean>(initAlwaysOnTop);

  const toggleAlwaysOnTop = async () => {
    setAlwaysOnTop(!alwaysOnTop);
    await setTop(!alwaysOnTop);
  }

  return (
    <div className={classnames(styles.titleBar, className)} style={style}>
      {children}
      <Flex align={'center'} gap={12} style={{ height: '100%', marginLeft: 'auto' }}>
        <TitlebarIcon
          tip={alwaysOnTop ? '取消置顶' : '置顶'}
          onClick={toggleAlwaysOnTop}
        >
          <PushpinOutlined className={classnames(styles.pin, { [styles.onTop]: alwaysOnTop })}/>
        </TitlebarIcon>
        <TitlebarIcon
          onClick={() => {
            useGlobalStateStore.setState((state) => {
              return {
                rightSidebarOpen: !state.rightSidebarOpen
              }
            })
          }}
        >
          <FiSidebar />
        </TitlebarIcon>
      </Flex>
    </div>
  )
});

export default Titlebar;
