import React, { memo } from "react";
import classnames from "classnames";
import styles from "./index.module.less";
import { Tooltip } from "antd";

interface SidebarItemProps {
  onClick: () => void;
  style?: React.CSSProperties;
  className?: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  isShortWidth?: boolean;
}

const SidebarItem = memo((props: SidebarItemProps) => {
  const { onClick, style, className, label, icon, active, isShortWidth } =
    props;

  return (
    <div
      className={classnames(styles.itemContainer, className, {
        [styles.active]: active,
        [styles.isShort]: isShortWidth,
      })}
      style={style}
      onClick={onClick}
    >
      <Tooltip title={isShortWidth ? label : ""} trigger={"hover"}>
        <div className={styles.icon}>{icon}</div>
      </Tooltip>
      <div className={styles.label}>{label}</div>
    </div>
  );
});

export default SidebarItem;
