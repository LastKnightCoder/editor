import React from "react";
import classnames from 'classnames';
import styles from './index.module.less';

interface IStatusBarProps {
  className?: string;
  style?: React.CSSProperties;
  configs: Array<{
    key: string;
    children: React.ReactNode;
    onClick?: () => void;
  }>
}

const StatusBar = (props: IStatusBarProps) => {
  const { className, style, configs } = props;

  return (
    <div className={classnames(styles.statusBar, className)} style={style}>
      {
        configs.map((config) => (
          <div key={config.key} onClick={config.onClick} className={styles.item}>
            {config.children}
          </div>
        ))
      }
    </div>
  )
}

export default StatusBar;