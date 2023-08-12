import React from 'react';
import classnames from "classnames";
import { useNavigate } from "react-router-dom";

import WindowControl from "@/components/WindowControl";

import styles from './index.module.less';

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
    <div data-tauri-drag-region style={style} className={classnames(styles.titleBar, className)}>
      <div className={styles.nav}>
        <div className={styles.item} onClick={() => { navigate('/cards') }}>卡片</div>
        <div className={styles.item}>文章</div>
        <div className={styles.item} onClick={navigateToDaily}>日记</div>
      </div>
      <WindowControl className={styles.windowControl} />
    </div>
  )
}

export default TitleBar;