import React from 'react';
import classnames from "classnames";
import { appWindow } from '@tauri-apps/api/window'

import { MinusOutlined, CloseOutlined, FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons';

import styles from './index.module.less';

interface IWindowControlProps {
  className?: string;
  style?: React.CSSProperties;
}

const WindowControl = (props: IWindowControlProps) => {
  const { className, style } = props;
  const [isFullscreen, setIsFullscreen] = React.useState<boolean>(false);

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