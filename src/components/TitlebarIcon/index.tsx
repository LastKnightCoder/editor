import React from "react";
import classnames from "classnames";

import styles from "./index.module.less";
import { Tooltip } from "antd";

interface ITitlebarIconProps {
  children: React.ReactNode;
  tip?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  active?: boolean;
  placement?: "top" | "bottom" | "left" | "right";
}

const TitlebarIcon = (props: ITitlebarIconProps) => {
  const { tip, children, className, style, onClick, active, placement } = props;

  return (
    <Tooltip title={tip} trigger={"hover"} placement={placement}>
      <div
        className={classnames(
          styles.icon,
          { [styles.active]: active },
          className,
        )}
        style={style}
        onClick={onClick}
      >
        {children}
      </div>
    </Tooltip>
  );
};

export default TitlebarIcon;
