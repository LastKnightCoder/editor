import React, { useEffect, useState } from 'react';
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import classnames from "classnames";

import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";
import If from "@/components/If";
import FocusMode from '../FocusMode';
import SelectDatabase from "@/components/SelectDatabase";
import SVG from 'react-inlinesvg';
import { Flex, Popover, Tooltip } from "antd";

import { MinusOutlined, CloseOutlined, PushpinOutlined } from '@ant-design/icons';
import { TbColumns3, TbColumns2, TbColumns1 } from "react-icons/tb";
import maxMax from '@/assets/window-control/max-max.svg';
import maxMin from '@/assets/window-control/max-min.svg';

import { appWindow } from '@tauri-apps/api/window'
import { type } from '@tauri-apps/api/os'
import { UnlistenFn } from "@tauri-apps/api/event";

import styles from './index.module.less';
import { FiSidebar } from "react-icons/fi";
import useTheme from "@/hooks/useTheme.ts";
import useCommandPanelStore from "@/stores/useCommandPanelStore.ts";

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
    notShowFullscreen = false,
    initAlwaysOnTop = false,
    showColumns = false,
    showSelectDatabase = false,
    showFocusMode = false,
    showRightSidebar = false,
    showSearch = false,
  } = props;

  const { isDark } = useTheme();

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
        showSearch && (
          <div
            className={classnames(styles.search, { [styles.dark]: isDark })}
            onClick={() => {
              useCommandPanelStore.setState({
                open: true
              })
            }}
          >
            <Flex gap={8} align={'center'}>
              <svg width="20" height="20" viewBox="0 0 20 20" style={{ width: 14, height: 14, fontWeight: 700 }}>
                <path
                  d="M14.386 14.386l4.0877 4.0877-4.0877-4.0877c-2.9418 2.9419-7.7115 2.9419-10.6533 0-2.9419-2.9418-2.9419-7.7115 0-10.6533 2.9418-2.9419 7.7115-2.9419 10.6533 0 2.9419 2.9418 2.9419 7.7115 0 10.6533z"
                  stroke="currentColor" fill="none" fill-rule="evenodd" stroke-linecap="round"
                  stroke-linejoin="round"></path>
              </svg>
              <span>搜索</span>
            </Flex>
            <Flex align={'center'}>
              <kbd>
                <svg width="15" height="15">
                  <path
                    d="M4.505 4.496h2M5.505 5.496v5M8.216 4.496l.055 5.993M10 7.5c.333.333.5.667.5 1v2M12.326 4.5v5.996M8.384 4.496c1.674 0 2.116 0 2.116 1.5s-.442 1.5-2.116 1.5M3.205 9.303c-.09.448-.277 1.21-1.241 1.203C1 10.5.5 9.513.5 8V7c0-1.57.5-2.5 1.464-2.494.964.006 1.134.598 1.24 1.342M12.553 10.5h1.953"
                    stroke-width="1.2" stroke="currentColor" fill="none" stroke-linecap="square"></path>
                </svg>
              </kbd>
              <kbd>
                <svg width="15" height="15">
                  <path
                    d="M4.505 4.496h2M5.505 5.496v5M8.216 4.496l.055 5.993M10 7.5c.333.333.5.667.5 1v2M12.326 4.5v5.996M8.384 4.496c1.674 0 2.116 0 2.116 1.5s-.442 1.5-2.116 1.5M3.205 9.303c-.09.448-.277 1.21-1.241 1.203C1 10.5.5 9.513.5 8V7c0-1.57.5-2.5 1.464-2.494.964.006 1.134.598 1.24 1.342M12.553 10.5h1.953"
                    stroke-width="1.2" stroke="currentColor" fill="none" stroke-linecap="square"></path>
                </svg>
              </kbd>
            </Flex>
          </div>
        )
      }
      {
        showSelectDatabase && (
          <SelectDatabase/>
        )
      }
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
                  <TbColumns2 className={styles.icon}/>
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
                  <TbColumns3 className={styles.icon}/>
                  <div>笔记本视图</div>
                </div>
              </div>
            )}
          >
            <div className={styles.item} onClick={onClickColumnIcon}>
              <TbColumns2/>
            </div>
          </Popover>
        )
      }
      {
        showFocusMode && (
          <FocusMode/>
        )
      }
      <Tooltip
        title={alwaysOnTop ? '取消置顶' : '置顶'}
      >
      <div className={classnames(styles.item)} onClick={toggleAlwaysOnTop}>
          <PushpinOutlined className={classnames(styles.pin, { [styles.onTop]: alwaysOnTop })}/>
        </div>
      </Tooltip>
      {
        showRightSidebar && (
          <div
            className={styles.item}
            onClick={() => {
              useGlobalStateStore.setState((state) => {
                return {
                  rightSidebarOpen: !state.rightSidebarOpen
                }
              })
            }}
          >
            <FiSidebar/>
          </div>
          // <TitlebarIcon
          //   onClick={() => {
          //     useGlobalStateStore.setState((state) => {
          //       return {
          //         rightSidebarOpen: !state.rightSidebarOpen
          //       }
          //     })
          //   }}
          // >
          //   <FiSidebar />
          // </TitlebarIcon>
        )
      }
      <div className={styles.item} onClick={minimize}>
        <MinusOutlined/>
      </div>
      <If condition={!notShowFullscreen}>
        <div className={styles.item} onClick={toggleMaximizable}>
          {
            isMaximizable ? <SVG src={maxMin} style={{ width: '1.6em', height: '1.6em' }}/> : <SVG src={maxMax}/>
          }
        </div>
      </If>
      <div className={styles.item} onClick={close}>
        <CloseOutlined/>
      </div>
    </div>
  )
}

export default WindowControl;
