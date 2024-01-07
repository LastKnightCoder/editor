import { useEffect, useState } from 'react';
import { MinusOutlined, CloseOutlined, FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons';
import { PiPushPinSimple } from "react-icons/pi";
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import classnames from "classnames";

import { appWindow } from '@tauri-apps/api/window'
import { type } from '@tauri-apps/api/os'
import { UnlistenFn } from "@tauri-apps/api/event";


import styles from './index.module.less';
import If from "@/components/If";
import { Tooltip } from "antd";

interface IWindowControlProps {
  className?: string;
  style?: React.CSSProperties;
  notShowFullscreen?: boolean;
  initAlwaysOnTop?: boolean;
}

const WindowControl = (props: IWindowControlProps) => {
  const { className, style, notShowFullscreen = false, initAlwaysOnTop = false } = props;
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState<boolean>(initAlwaysOnTop);

  useAsyncEffect(async () => {
    const osType = await type();
    const isMac = osType === 'Darwin';
    if (isMac) {
      const root = document.getElementById('root');
      if (!root) return;
      root.classList.add('mac');
    }
  }, []);

  const updateIsWindowMaximized = useMemoizedFn(async () => {
    const isWindowMaximized = await appWindow.isMaximized();
    const root = document.getElementById('root');
    if (!root) return;
    if (isWindowMaximized) {
      root.classList.add('maximized');
    } else {
      root.classList.remove('maximized');
    }
  });

  useEffect( () => {
    let unlisten: UnlistenFn | undefined;

    type().then((osType) => {
      if (osType !== 'Windows_NT') return;
      appWindow.onResized(() => {
        updateIsWindowMaximized();
      }).then((unlistenFn) => {
        unlisten = unlistenFn;
      });
    });

    return () => unlisten && unlisten();
  }, [updateIsWindowMaximized]);

  const minimize = async () => {
    await appWindow.minimize();
  }

  const toggleFullscreen = async () => {
    const isFullscreen = await appWindow.isFullscreen();
    setIsFullscreen(!isFullscreen);
    await appWindow.setFullscreen(!isFullscreen);
    const root = document.getElementById('root');
    if (!root) return;
    if (isFullscreen) {
      root.classList.remove('fullscreen');
    } else {
      root.classList.add('fullscreen');
    }
  }

  const toggleAlwaysOnTop = async () => {
    setAlwaysOnTop(!alwaysOnTop);
    await appWindow.setAlwaysOnTop(!alwaysOnTop);
  }

  const close = async () => {
    await appWindow.close();
  }

  return (
    <div className={classnames(styles.windowControl, className)} style={style}>
      <Tooltip
        title={alwaysOnTop ? '取消置顶' : '置顶'}
      >
        <div className={classnames(styles.item, { [styles.onTop]: alwaysOnTop })} onClick={toggleAlwaysOnTop}>
          <PiPushPinSimple />
        </div>
      </Tooltip>
      <div className={styles.item} onClick={minimize}>
        <MinusOutlined />
      </div>
      <If condition={!notShowFullscreen}>
        <div className={styles.item} onClick={toggleFullscreen}>
          {
            isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />
          }
        </div>
      </If>
      <div className={styles.item} onClick={close}>
        <CloseOutlined />
      </div>
    </div>
  )
}

export default WindowControl;