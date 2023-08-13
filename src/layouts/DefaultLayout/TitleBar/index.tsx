import React from 'react';
import classnames from "classnames";
import { useNavigate } from "react-router-dom";
import { CaretDownOutlined } from '@ant-design/icons';

import WindowControl from "@/components/WindowControl";

import styles from './index.module.less';
import {Popover} from "antd";

interface ITitleBarProps {
  className?: string;
  style?: React.CSSProperties;
}

const TitleBar = (props: ITitleBarProps) => {
  const { className, style } = props;
  const navigate = useNavigate();

  const navigateToDaily = () => {
    navigate('/daily');
  }

  return (
    <div
      data-tauri-drag-region
      style={style}
      className={classnames(styles.titleBar, className)}
    >
      <div className={styles.nav}>
        <Popover
          trigger={'hover'}
          placement={'bottom'}
          overlayInnerStyle={{
            padding: 4,
          }}
          content={
            <div className={styles.dropCard}>
              <div className={styles.childItem} onClick={() => { navigate('/cards/list') }}>卡片列表</div>
              <div className={styles.childItem} onClick={() => { navigate('/cards/link-graph') }}>关系图谱</div>
            </div>
          }
        >
          <div className={styles.item}>卡片管理 <CaretDownOutlined /></div>
        </Popover>
        <div className={styles.item}>文章</div>
        <div className={styles.item} onClick={navigateToDaily}>日记</div>
      </div>
      <WindowControl className={styles.windowControl} />
    </div>
  )
}

export default TitleBar;