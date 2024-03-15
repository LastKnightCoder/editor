import { useEffect, useState } from 'react';
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import classnames from "classnames";

import If from "@/components/If";
import SVG from 'react-inlinesvg';
import { Tooltip } from "antd";

import { MinusOutlined, CloseOutlined } from '@ant-design/icons';
import { PiPushPinSimple } from "react-icons/pi";
import maxMax from '@/assets/window-control/max-max.svg';
import maxMin from '@/assets/window-control/max-min.svg';

import { appWindow } from '@tauri-apps/api/window'
import { type } from '@tauri-apps/api/os'
import { UnlistenFn } from "@tauri-apps/api/event";

import styles from './index.module.less';


interface IWindowControlProps {
  className?: string;
  style?: React.CSSProperties;
  notShowFullscreen?: boolean;
  initAlwaysOnTop?: boolean;
}

const WindowControl = (props: IWindowControlProps) => {
  const { className, style, notShowFullscreen = false, initAlwaysOnTop = false } = props;
  const [isMaximizable, setIsMaximizable] = useState<boolean>(false);
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
      setIsMaximizable(true);
    } else {
      root.classList.remove('maximized');
      setIsMaximizable(false);
    }
  });

  useEffect( () => {
    let unlisten: UnlistenFn | undefined;

    type().then((osType) => {
      if (osType !== 'Windows_NT') return;
      appWindow.onResized(() => {
        updateIsWindowMaximized().then();
      }).then((unlistenFn) => {
        unlisten = unlistenFn;
      });
    });

    return () => unlisten && unlisten();
  }, [updateIsWindowMaximized]);

  const minimize = async () => {
    await appWindow.minimize();
  }

  const toggleMaximizable = async () => {
    const isMaximized = await appWindow.isMaximized();
    if (isMaximized) {
      await appWindow.unmaximize();
    } else {
      await appWindow.maximize();
    }
    setIsMaximizable(!isMaximized);
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
        <div className={styles.item} onClick={toggleMaximizable}>
          {
            isMaximizable ? <SVG src={maxMin} style={{ width: '1.6em', height: '1.6em' }} /> : <SVG src={maxMax} />
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