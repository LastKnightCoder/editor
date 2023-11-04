import React from "react";
import classnames from "classnames";

import styles from './index.module.less';
import { Tooltip } from "antd";

interface IIconTextProps {
  icon: React.ReactNode;
  text: React.ReactNode;
  onlyShowIcon?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const IconText = (props: IIconTextProps) => {
  const { icon, text, onClick, className, style, onlyShowIcon } = props;
  return (
    <div className={classnames(styles.iconText, className)} onClick={onClick} style={style}>
      <Tooltip title={onlyShowIcon ? text : ''} trigger={'hover'} placement={'right'}>
        <div>{icon}</div>
      </Tooltip>
      {
        !onlyShowIcon && (
          <div className={styles.text}>{text}</div>
        )
      }
    </div>
  )
}

export default IconText;