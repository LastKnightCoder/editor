import {useCallback, useEffect, useState} from 'react';
import classnames from "classnames";
import { appWindow } from '@tauri-apps/api/window'

import { MinusOutlined, CloseOutlined, FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons';

import styles from './index.module.less';
import {UnlistenFn} from "@tauri-apps/api/event";
import {useMemoizedFn} from "ahooks";

interface IWindowControlProps {
  className?: string;
  style?: React.CSSProperties;
}

const WindowControl = (props: IWindowControlProps) => {
  const { className, style } = props;
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

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

  useEffect(() => {
    updateIsWindowMaximized();

    let unlisten: UnlistenFn;

    const listen = async () => {
      unlisten = await appWindow.onResized(() => {
        updateIsWindowMaximized();
      });
    };

    listen();

    return () => unlisten && unlisten();
  }, [updateIsWindowMaximized]);

  const minimize = async () => {
    await appWindow.minimize();
  }

  const toggleFullscreen = async () => {
    const isFullscreen = await appWindow.isFullscreen();
    setIsFullscreen(!isFullscreen);
    await appWindow.setFullscreen(!isFullscreen);
  }

  const close = async () => {
    await appWindow.close();
  }

  return (
    <div className={classnames(styles.windowControl, className)} style={style}>
      <div className={styles.item} onClick={minimize}>
        <MinusOutlined />
      </div>
      <div className={styles.item} onClick={toggleFullscreen}>
        {
          isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />
        }
      </div>
      <div className={styles.item} onClick={close}>
        <CloseOutlined />
      </div>
    </div>
  )
}

export default WindowControl;