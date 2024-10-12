import React from "react";
import classnames from "classnames";
import SVG from 'react-inlinesvg';

import styles from './index.module.less';
import { Tooltip } from "antd";

interface IIconTextProps {
  icon: string;
  text: React.ReactNode;
  active?: boolean;
  onlyShowIcon?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const IconText = (props: IIconTextProps) => {
  const { icon, text, onClick, className, style, onlyShowIcon, active } = props;
  return (
    <div className={classnames(styles.iconText, { [styles.active]: active }, className)} onClick={onClick} style={style}>
      <Tooltip title={onlyShowIcon ? text : ''} trigger={'hover'} placement={'right'}>
        <div className={styles.icon}>
          <SVG src={icon} />
        </div>
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