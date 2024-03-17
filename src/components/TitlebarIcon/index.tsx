import React from 'react';
import classnames from 'classnames';

import styles from './index.module.less';

interface ITitlebarIconProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  active?: boolean;
}

const TitlebarIcon = (props: ITitlebarIconProps) => {
  const { children, className, style, onClick, active } = props;

  return (
    <div
      className={classnames(styles.icon, { [styles.active]: active }, className)}
      style={style}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

export default TitlebarIcon;