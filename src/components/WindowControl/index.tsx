import React, { useState } from 'react';
import classnames from "classnames";

import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";
import FocusMode from '../FocusMode';
import { Popover, Tooltip } from "antd";

import { PushpinOutlined } from '@ant-design/icons';
import { TbColumns3, TbColumns2, TbColumns1 } from "react-icons/tb";

import styles from './index.module.less';
import { FiSidebar } from "react-icons/fi";
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
    showFocusMode = false,
    showRightSidebar = false,
  } = props;
  
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
          <FocusMode />
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
