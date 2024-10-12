import React, { useEffect, useState } from 'react';
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import classnames from "classnames";

import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";
import If from "@/components/If";
import FocusMode from '../FocusMode';
import SVG from 'react-inlinesvg';
import { Popover, Tooltip } from "antd";

import { MinusOutlined, CloseOutlined, PushpinOutlined } from '@ant-design/icons';
import { TbColumns3, TbColumns2, TbColumns1 } from "react-icons/tb";
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
  showColumns?: boolean;
}

const WindowControl = (props: IWindowControlProps) => {
  const { className, style, notShowFullscreen = false, initAlwaysOnTop = false, showColumns = false } = props;
  const [isMaximizable, setIsMaximizable] = useState<boolean>(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState<boolean>(initAlwaysOnTop);

  const { listOpen, sidebarOpen } = useGlobalStateStore(state => ({
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
        sidebarOpen: false
      });
    }
    if (!listOpen && !sidebarOpen) {
      useGlobalStateStore.setState({
        listOpen: true,
        sidebarOpen: true
      });
    }
  }

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
      {
        showColumns && (
          <Popover
            trigger={'hover'}
            overlayInnerStyle={{
              padding: 4
            }}
            content={(
              <div className={styles.columns}>
                <div
                  className={styles.column}
                  onClick={() => {
                    useGlobalStateStore.setState({
                      listOpen: false,
                      sidebarOpen: false
                    })
                  }}
                >
                  <TbColumns1 className={styles.icon}/>
                  <div>编辑器视图</div>
                </div>
                <div
                  className={styles.column}
                  onClick={() => {
                    useGlobalStateStore.setState({
                      listOpen: true,
                      sidebarOpen: false
                    })
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
                      sidebarOpen: true
                    })
                  }}
                >
                  <TbColumns3 className={styles.icon} />
                  <div>笔记本视图</div>
                </div>
              </div>
            )}
          >
            <div className={styles.item} onClick={onClickColumnIcon}>
              <TbColumns2 />
            </div>
          </Popover>
        )
      }
      <FocusMode />
      <Tooltip
        title={alwaysOnTop ? '取消置顶' : '置顶'}
      >
        <div className={classnames(styles.item)} onClick={toggleAlwaysOnTop}>
          <PushpinOutlined className={classnames(styles.pin, { [styles.onTop]: alwaysOnTop })} />
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