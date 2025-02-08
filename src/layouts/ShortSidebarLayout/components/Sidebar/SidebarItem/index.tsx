import React from "react";
import classnames from "classnames";
import styles from './index.module.less';

interface SidebarItemProps {
  onClick: () => void;
  style?: React.CSSProperties;
  className?: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
}

const SidebarItem = (props: SidebarItemProps) => {
  const { onClick, style, className, label, icon, active } = props;
  
  return (
    <div
      className={classnames(styles.itemContainer, className, { [styles.active]: active })}
      style={style}
      onClick={onClick}
    >
      <div className={styles.icon}>
        { icon }
      </div>
      <div className={styles.label}>
        { label }
      </div>
    </div>
  )
}

export default SidebarItem;
