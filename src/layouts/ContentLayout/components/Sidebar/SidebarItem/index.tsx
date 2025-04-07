import React, { memo } from "react";
import SVG from "react-inlinesvg";
import classnames from "classnames";
import styles from "./index.module.less";
import { Tooltip } from "antd";

interface SidebarItemProps {
  onClick: () => void;
  style?: React.CSSProperties;
  className?: string;
  label: string;
  icon: string;
  active: boolean;
  isShortWidth?: boolean;
}

const SidebarItem = memo((props: SidebarItemProps) => {
  const { onClick, style, className, label, icon, active, isShortWidth } =
    props;

  return (
    <Tooltip
      title={isShortWidth ? label : ""}
      trigger={"hover"}
      placement="right"
    >
      <div
        className={classnames(styles.itemContainer, className, {
          [styles.active]: active,
          [styles.isShort]: isShortWidth,
        })}
        style={style}
        onClick={onClick}
      >
        <div className={styles.icon}>
          <SVG src={icon} />
        </div>

        <div className={styles.label}>{label}</div>
      </div>
    </Tooltip>
  );
});

export default SidebarItem;
