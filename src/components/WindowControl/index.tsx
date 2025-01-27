import React, { useState } from 'react';
import classnames from "classnames";

import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";
import FocusMode from '../FocusMode';
import SelectDatabase from "@/components/SelectDatabase";
import { Flex, Popover, Tooltip } from "antd";

import { PushpinOutlined } from '@ant-design/icons';
import { TbColumns3, TbColumns2, TbColumns1 } from "react-icons/tb";

import styles from './index.module.less';
import { FiSidebar } from "react-icons/fi";
import useTheme from "@/hooks/useTheme.ts";
import useCommandPanelStore from "@/stores/useCommandPanelStore.ts";
import { setAlwaysOnTop as setTop } from '@/commands';

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
    showSelectDatabase = false,
    showFocusMode = false,
    showRightSidebar = false,
    showSearch = false,
  } = props;

  const { isDark } = useTheme();

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

  const toggleAlwaysOnTop = async () => {
    setAlwaysOnTop(!alwaysOnTop);
    await setTop(!alwaysOnTop);
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
                  stroke="currentColor" fill="none" fillRule="evenodd" strokeLinecap="round"
                  strokeLinejoin="round"></path>
              </svg>
              <span>搜索</span>
            </Flex>
            <Flex align={'center'}>
              <kbd>
                <svg width="15" height="15">
                  <path
                    d="M4.505 4.496h2M5.505 5.496v5M8.216 4.496l.055 5.993M10 7.5c.333.333.5.667.5 1v2M12.326 4.5v5.996M8.384 4.496c1.674 0 2.116 0 2.116 1.5s-.442 1.5-2.116 1.5M3.205 9.303c-.09.448-.277 1.21-1.241 1.203C1 10.5.5 9.513.5 8V7c0-1.57.5-2.5 1.464-2.494.964.006 1.134.598 1.24 1.342M12.553 10.5h1.953"
                    strokeWidth="1.2" stroke="currentColor" fill="none" strokeLinecap="square"></path>
                </svg>
              </kbd>
              <kbd>
                <svg width="15" height="15">
                  <path
                    d="M4.505 4.496h2M5.505 5.496v5M8.216 4.496l.055 5.993M10 7.5c.333.333.5.667.5 1v2M12.326 4.5v5.996M8.384 4.496c1.674 0 2.116 0 2.116 1.5s-.442 1.5-2.116 1.5M3.205 9.303c-.09.448-.277 1.21-1.241 1.203C1 10.5.5 9.513.5 8V7c0-1.57.5-2.5 1.464-2.494.964.006 1.134.598 1.24 1.342M12.553 10.5h1.953"
                    strokeWidth="1.2" stroke="currentColor" fill="none" strokeLinecap="square"></path>
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
        )
      }
    </div>
  )
}

export default WindowControl;
